import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sync, officialUrl, sourceHash } from "../scripts/sync.mjs";

test("Only HTTPS Câmara sources are accepted, including against lookalike hosts", () => {
  assert.equal(
    officialUrl("https://dadosabertos.camara.leg.br/api/v2/proposicoes/123"),
    "https://dadosabertos.camara.leg.br/api/v2/proposicoes/123",
  );
  for (const value of [
    "http://www.camara.leg.br/a",
    "https://www.camara.leg.br.evil.test/a",
    "https://evil.test/camara.leg.br",
    "javascript:alert(1)",
    "https://user:pass@www.camara.leg.br/a",
  ])
    assert.throws(() => officialUrl(value));
});

test("Sync publishes source-backed summaries, paginated votes and removes stale summaries; API failures preserve the snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vigia-test-"));
  const cwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const API = "https://dadosabertos.camara.leg.br/api/v2";
  const p = {
    id: 123,
    siglaTipo: "PL",
    numero: 43,
    ano: 2026,
    descricaoTipo: "Projeto de Lei",
    ementa: "Propõe atendimento público.",
    dataApresentacao: "2026-02-03T10:30",
    uri: `${API}/proposicoes/123`,
    urlInteiroTeor: "https://www.camara.leg.br/texto",
    statusProposicao: { descricaoTramitacao: "Urgência aprovada" },
  };
  let fail = false;
  globalThis.fetch = async (input) => {
    if (fail) return new Response("Indisponível", { status: 503 });
    const url = new URL(input);
    let dados;
    let links = [];
    if (url.pathname.endsWith("/autores"))
      dados = [{ nome: "Autora oficial", tipo: "Deputado(a)" }];
    else if (url.pathname.endsWith("/proposicoes/123/votacoes")) {
      dados = [
        {
          id: url.search ? "v2" : "v1",
          data: "2026-02-04",
          descricao: url.search
            ? "Retirada de pauta rejeitada"
            : "Requerimento de urgência aprovado",
          siglaOrgao: "PLEN",
          uri: `${API}/votacoes/${url.search ? "v2" : "v1"}`,
        },
      ];
      if (!url.search)
        links = [
          { rel: "next", href: `${API}/proposicoes/123/votacoes?pagina=2` },
        ];
    } else if (url.pathname.endsWith("/proposicoes/123")) dados = p;
    else if (url.pathname.endsWith("/proposicoes")) dados = [p];
    else if (url.pathname.endsWith("/votacoes")) dados = [];
    else throw new Error(`Unexpected request: ${url.pathname}`);
    return Response.json({ dados, links });
  };
  try {
    process.chdir(directory);
    await mkdir("data");
    await writeFile(
      "data/summaries.json",
      JSON.stringify({
        123: {
          sourceHash: sourceHash(p),
          title: "Atendimento público",
          text: "A proposta trata de atendimento.",
          topic: "Saúde",
          generatedAt: "2026-02-03T12:00:00Z",
        },
      }),
    );
    await sync();
    let snapshot = JSON.parse(await readFile("static/dados.json", "utf8"));
    assert.equal(
      snapshot.propositions[0].summary.text,
      "A proposta trata de atendimento.",
    );
    assert.equal(snapshot.propositions[0].authors[0].name, "Autora oficial");
    assert.equal(snapshot.propositions[0].votes.length, 2);
    assert.equal(
      snapshot.propositions[0].votes[0].description,
      "Requerimento de urgência aprovado",
    );
    assert.equal(
      snapshot.propositions[0].status.descricaoTramitacao,
      "Urgência aprovada",
    );
    assert.deepEqual(
      JSON.parse(await readFile("data/pending.json", "utf8")),
      [],
    );
    p.ementa = "Propõe outra regra, diferente da original.";
    await sync();
    snapshot = JSON.parse(await readFile("static/dados.json", "utf8"));
    assert.equal(snapshot.propositions[0].summary, null);
    assert.equal(snapshot.propositions[0].ementa, p.ementa);
    assert.equal(
      JSON.parse(await readFile("data/pending.json", "utf8"))[0].ementa,
      p.ementa,
    );
    const before = await readFile("static/dados.json", "utf8");
    fail = true;
    await assert.rejects(sync(), /HTTP 503/);
    assert.equal(await readFile("static/dados.json", "utf8"), before);
    assert.equal(await readFile("src/lib/data/portal.json", "utf8"), before);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
