import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { Camara, makeCamaraLayer } from "../scripts/pipeline/camara.ts";
import { archiveRun } from "../scripts/pipeline/storage.ts";

const run = (program) => Effect.runPromise(program.pipe(Effect.scoped));

const API = "https://dadosabertos.camara.leg.br/api/v2";

test("Official client recovers transient errors, retains pages, rejects malicious/circular/unbounded pagination and non-retryable errors", async () => {
  const url = `${API}/proposicoes/123/votacoes`;
  const responses = [
    new Response(null, { status: 429, headers: { "retry-after": "0" } }),
    new Response(null, { status: 503 }),
    Response.json({
      dados: [{ id: "v1" }],
      links: [{ rel: "next", href: `${url}?pagina=2` }],
    }),
    Response.json({ dados: [{ id: "v2" }], links: [] }),
  ];
  const result = await run(
    Effect.gen(function* () {
      const client = yield* Camara;
      return { items: yield* client.all(url), raw: yield* client.raw };
    }).pipe(
      Effect.provide(
        makeCamaraLayer({
          fetcher: async () => responses.shift(),
          baseDelayMs: 0,
        }),
      ),
    ),
  );
  assert.deepEqual(result.items, [{ id: "v1" }, { id: "v2" }]);
  assert.equal(result.raw.length, 2);
  const request = (method, options) =>
    run(
      Effect.flatMap(Camara, (client) => client[method](url)).pipe(
        Effect.provide(makeCamaraLayer({ baseDelayMs: 0, ...options })),
      ),
    );
  await assert.rejects(
    request("get", {
      fetcher: async () => new Response(null, { status: 400 }),
    }),
    /HTTP 400/,
  );
  await assert.rejects(
    request("all", {
      fetcher: async () =>
        Response.json({ dados: [], links: [{ rel: "next", href: url }] }),
    }),
    /circular/,
  );
  await assert.rejects(
    request("all", {
      maxPages: 1,
      fetcher: async () =>
        Response.json({
          dados: [],
          links: [{ rel: "next", href: `${url}?pagina=2` }],
        }),
    }),
    /limite/,
  );
  await assert.rejects(
    request("all", {
      fetcher: async () =>
        Response.json({
          dados: [],
          links: [
            { rel: "next", href: "https://evil.test/api/v2/proposicoes" },
          ],
        }),
    }),
    /fontes oficiais/,
  );
  await assert.rejects(
    request("get", {
      fetcher: async () => new Response(" ".repeat(10 * 1024 * 1024 + 1)),
    }),
    /10 MiB/,
  );
});

test("Archive stores each artifact under its content hash; the manifest lists every key and sha256 that the stored bytes produce", async () => {
  const raw = {
    url: `${API}/proposicoes/123`,
    collectedAt: "2026-10-29T12:00:00.000Z",
    body: { dados: { original: "Texto oficial bruto" }, links: [] },
  };
  const normalized = { b: 1, a: [{ d: "é", c: null }] };
  const { key, manifest, objects } = await run(
    archiveRun([
      { kind: "raw", value: raw },
      { kind: "normalized", value: normalized },
    ]),
  );
  assert.equal(manifest.artifacts.length, 2);
  for (const entry of manifest.artifacts) {
    const body = objects.get(entry.key);
    assert.equal(entry.key, `v1/${entry.kind}/${entry.sha256}.json`);
    assert.equal(createHash("sha256").update(body).digest("hex"), entry.sha256);
    assert.equal(Buffer.byteLength(body), entry.bytes);
  }
  assert.equal(
    objects.get(manifest.artifacts[1].key),
    '{\n  "a": [\n    {\n      "c": null,\n      "d": "é"\n    }\n  ],\n  "b": 1\n}\n',
  );
  const stored = objects.get(key);
  assert.equal(
    key,
    `v1/manifests/${createHash("sha256").update(stored).digest("hex")}.json`,
  );
  assert.deepEqual(
    JSON.parse(stored).artifacts.map(({ kind, key, sha256 }) => ({
      kind,
      key,
      sha256,
    })),
    manifest.artifacts.map(({ kind, key, sha256 }) => ({ kind, key, sha256 })),
  );
});
