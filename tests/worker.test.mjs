import { test } from "node:test";
import assert from "node:assert/strict";
import { metrics } from "../worker/metrics.ts";
import { currentYear } from "../worker/definitions.ts";

// The Worker keeps parsed files in isolate memory across requests, so each
// test uses its own years.
function harness(files) {
  const reads = [];
  const store = {
    get: async (key) => {
      reads.push(key);
      return key in files
        ? { etag: `e-${key}`, text: async () => JSON.stringify(files[key]) }
        : null;
    },
  };
  const entries = new Map();
  const cache = {
    match: async (key) => entries.get(key.url)?.clone(),
    put: async (key, response) => void entries.set(key.url, response),
  };
  const pending = [];
  const get = (path, headers = {}) =>
    metrics(
      new Request(`https://vigia.example${path}`, { headers }),
      store,
      cache,
      (p) => pending.push(p),
    ).then(async (response) => {
      await Promise.all(pending);
      return response;
    });
  return { get, reads, entries };
}

test("rejects anything but known years, blocs and IDs before reading R2", async () => {
  const { get, reads } = harness({});
  for (const path of [
    "/api/metricas/votacoes?ano=2026;DROP",
    "/api/metricas/votacoes?ano=1999",
    "/api/metricas/votacoes?ano=2999",
    "/api/metricas/alinhamento?ano=2020&bancada=PT' OR '1'='1",
    "/api/metricas/deputados/12a",
    "/api/metricas/nada",
  ])
    assert.equal((await get(path)).status, 400, path);
  assert.equal(reads.length, 0);
});

test("one R2 read serves every deputy and parameter spelling of a year", async () => {
  const { get, reads, entries } = harness({
    "metricas/v1/2011/deputados.json": {
      calculado_em: "2026-11-05T00:00:00Z",
      deputados: {
        10: [{ orgao: "plenario", voto: "Sim", votos: 3 }],
        20: [{ orgao: "outros", voto: "Não", votos: 1 }],
      },
    },
    "metricas/v1/2011/alinhamento.json": {
      bancadas: { Governo: [{ partido: "A" }], Oposição: [{ partido: "B" }] },
    },
  });
  const first = await get("/api/metricas/deputados/10?ano=2011");
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.deepEqual(body.linhas, [{ orgao: "plenario", voto: "Sim", votos: 3 }]);
  assert.equal(body.deputado, 10);

  // Another deputy: same file, from memory. Unknown deputy: 404, no read.
  assert.deepEqual(
    (await (await get("/api/metricas/deputados/20?ano=2011")).json()).linhas,
    [{ orgao: "outros", voto: "Não", votos: 1 }],
  );
  assert.equal((await get("/api/metricas/deputados/30?ano=2011")).status, 404);
  assert.deepEqual(reads, ["metricas/v1/2011/deputados.json"]);

  // Bloc is part of the key; parameter order and extras are not.
  const oposicao = await get(
    "/api/metricas/alinhamento?bancada=Oposição&x=1&ano=2011",
  );
  assert.deepEqual((await oposicao.json()).linhas, [{ partido: "B" }]);
  const again = await get(
    "/api/metricas/alinhamento?ano=2011&bancada=Oposição",
  );
  assert.deepEqual((await again.json()).linhas, [{ partido: "B" }]);
  assert.equal(reads.length, 2);
  assert.equal(entries.size, 4);
  assert.match(again.headers.get("cache-control"), /max-age=86400/);
});

test("answers If-None-Match with 304 and reports years not yet computed", async () => {
  const { get } = harness({
    "metricas/v1/2012/votacoes.json": { linhas: [{ mes: 1 }] },
  });
  const first = await get("/api/metricas/votacoes?ano=2012");
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const fresh = harness({ "metricas/v1/2012/votacoes.json": { linhas: [] } });
  const revalidated = await fresh.get("/api/metricas/votacoes?ano=2012", {
    "if-none-match": etag,
  });
  assert.equal(revalidated.status, 304);
  assert.equal((await get("/api/metricas/fontes?ano=2013")).status, 404);
});

test("without ?ano, a year not computed yet falls back to the previous one", async () => {
  const ano = currentYear();
  const { get, reads } = harness({
    [`metricas/v1/${ano - 1}/votacoes.json`]: { linhas: [{ mes: 12 }] },
  });
  const first = await get("/api/metricas/votacoes");
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.ano, ano - 1);
  assert.deepEqual(body.linhas, [{ mes: 12 }]);
  assert.match(first.headers.get("cache-control"), /max-age=3600/);
  // Cached under the default key: no further R2 reads.
  assert.equal((await get("/api/metricas/votacoes")).status, 200);
  assert.equal(reads.length, 2);
  // An explicit year is never replaced by another one.
  assert.equal((await get(`/api/metricas/fontes?ano=${ano}`)).status, 404);
});
