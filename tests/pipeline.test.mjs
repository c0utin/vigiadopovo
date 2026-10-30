import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
  let duplicate = false;
  globalThis.fetch = async (input) => {
    if (fail) return new Response("Indisponível", { status: 503 });
    const url = new URL(input);
    let dados;
    let links = [];
    if (url.pathname.endsWith("/proposicoes/124/temas")) dados = [];
    else if (url.pathname.endsWith("/temas"))
      dados = [
        { codTema: 56, tema: "Saúde", relevancia: 1 },
        { codTema: 46, tema: "Educação", relevancia: 0 },
      ];
    else if (url.pathname.endsWith("/votacoes/v1/votos")) {
      dados = [
        {
          tipoVoto: url.search ? "Obstrução" : "Sim",
          dataRegistroVoto: "2026-02-04T14:05:00",
          deputado_: {
            id: url.search && !duplicate ? 456 : 123,
            nome: url.search ? "Deputada B" : "Deputado A",
            siglaPartido: "PARTIDO-NO-REGISTRO",
            siglaUf: "PA",
            idLegislatura: 57,
            email: "contato@example.invalid",
            urlFoto: "https://www.camara.leg.br/foto.jpg",
          },
        },
      ];
      if (!url.search)
        links = [{ rel: "next", href: `${API}/votacoes/v1/votos?pagina=2` }];
    } else if (url.pathname.endsWith("/votacoes/v2/votos")) dados = [];
    else if (/\/votacoes\/v[12]$/.test(url.pathname))
      dados = {
        id: url.pathname.split("/").at(-1),
        uri: `${API}${url.pathname.replace("/api/v2", "")}`,
        data: "2026-02-04",
        descricao: "Etapa processual",
        siglaOrgao: "PLEN",
        aprovacao: 1,
        proposicoesAfetadas: [{ id: 123 }],
      };
    else if (url.pathname.endsWith("/autores"))
      dados = [{ nome: "Autora oficial", tipo: "Deputado(a)" }];
    else if (/\/proposicoes\/(123|124)\/votacoes$/.test(url.pathname)) {
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
    else if (url.pathname.endsWith("/proposicoes/124"))
      dados = { ...p, id: 124, uri: `${API}/proposicoes/124` };
    else if (url.pathname.endsWith("/proposicoes")) dados = [p, { id: 124 }];
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
    assert.deepEqual(
      snapshot.propositions[0].labels.map((label) => label.id),
      ["camara:tema:46", "camara:tema:56"],
    );
    const legislative = JSON.parse(
      await readFile("static/legislativo.json", "utf8"),
    );
    assert.deepEqual(
      legislative,
      JSON.parse(await readFile("data/legislative.json", "utf8")),
    );
    assert.deepEqual(
      legislative.votings[0].ballots.map((ballot) => [
        ballot.deputyId,
        ballot.vote,
        ballot.party,
      ]),
      [
        [123, "Sim", "PARTIDO-NO-REGISTRO"],
        [456, "Obstrução", "PARTIDO-NO-REGISTRO"],
      ],
    );
    assert.equal(
      legislative.votings[1].ballotCoverage,
      "no-individual-records",
    );
    assert.deepEqual(legislative.votings[0].propositionIds, [123, 124]);
    assert.deepEqual(legislative.propositions[1].labels, []);
    assert.deepEqual(legislative.votings[1].ballots, []);
    const provenance = JSON.parse(
      await readFile("src/lib/data/provenance.json", "utf8"),
    );
    assert.equal(provenance.counts.ballots, 2);
    assert.equal(provenance.inferenceInThisRun, false);
    for (const entry of provenance.artifacts) {
      const body = await readFile(`static${entry.url}`, "utf8");
      assert.equal(Buffer.byteLength(body), entry.bytes);
      assert.equal(
        createHash("sha256").update(body).digest("hex"),
        entry.sha256,
      );
      assert.equal(body.includes("contato@example.invalid"), false);
      if (entry.kind === "raw" && JSON.parse(body).url.includes("/votos")) {
        assert.ok(
          JSON.parse(body).redactions.includes("dados[].deputado_.email"),
        );
      }
    }
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
      JSON.parse(await readFile("data/pending.json", "utf8")).map((p) => p.id),
      [124],
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
    const ledgerBefore = await readFile("static/legislativo.json", "utf8");
    duplicate = true;
    await assert.rejects(sync(), /duplicados/);
    assert.equal(
      await readFile("static/legislativo.json", "utf8"),
      ledgerBefore,
    );
    duplicate = false;
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
