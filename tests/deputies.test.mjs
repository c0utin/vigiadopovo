import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCamaraLayer } from "../scripts/pipeline/camara.ts";
import { syncDeputies } from "../scripts/deputies.mjs";

const API = "https://dadosabertos.camara.leg.br/api/v2";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fixture({ duplicateVote = false } = {}) {
  const detail = (id, nome, extra = {}) => ({
    id,
    uri: `${API}/deputados/${id}`,
    nomeCivil: `${nome.toUpperCase()} CIVIL`,
    cpf: "12345678900",
    dataNascimento: "1970-01-01",
    escolaridade: "Superior",
    municipioNascimento: "Recife",
    ufNascimento: "PE",
    ultimoStatus: {
      id,
      nome,
      nomeEleitoral: nome,
      siglaPartido: "AAA",
      siglaUf: "PE",
      situacao: "Exercício",
      condicaoEleitoral: "Titular",
      data: "2023-02-01",
      email: "gabinete@camara.leg.br",
      gabinete: { telefone: "3215-0000", email: "dep@camara.leg.br" },
      ...extra,
    },
  });
  const vote = (idVotacao, id, party, at) => ({
    idVotacao,
    dataHoraVoto: at,
    voto: "Sim",
    deputado_: { id: String(id), siglaPartido: party },
  });
  const votes = [
    vote("p1", 1, "AAA", "2026-02-01T10:00:00"),
    vote("p2", 1, "BBB", "2026-04-01T10:00:00"),
    vote("c1", 1, "BBB", "2026-04-02T10:00:00"),
    vote("p1", 2, "AAA", "2026-02-01T10:00:00"),
    // Not in office: counted nowhere, no profile.
    vote("p1", 99, "CCC", "2026-02-01T10:00:00"),
  ];
  if (duplicateVote) votes.push(vote("p2", 1, "BBB", "2026-04-01T10:05:00"));
  const membership = (id, sigla, cargo, dataInicio, dataFim) => ({
    uriOrgao: `${API}/orgaos/${sigla}`,
    siglaOrgao: sigla,
    nomePublicacaoOrgao: `Comissão ${sigla}`,
    uriDeputado: `${API}/deputados/${id}`,
    cargo,
    dataInicio,
    dataFim,
  });
  const routes = {
    "/api/v2/deputados": {
      dados: [3, 1, 2].map((id) => ({ id, idLegislatura: 57 })),
      links: [],
    },
    "/api/v2/deputados/1": { dados: detail(1, "Ana"), links: [] },
    "/api/v2/deputados/2": { dados: detail(2, "Bruno"), links: [] },
    "/api/v2/deputados/3": {
      dados: detail(3, "Carla", { condicaoEleitoral: "Suplente" }),
      links: [],
    },
    // itens=1: the last page number is the total number of speeches.
    "/api/v2/deputados/1/discursos": {
      dados: [{}],
      links: [
        { rel: "last", href: `${API}/deputados/1/discursos?pagina=7&itens=1` },
      ],
    },
    "/api/v2/deputados/2/discursos": { dados: [{}], links: [] },
    "/api/v2/deputados/3/discursos": { dados: [], links: [] },
    votacoesVotos: { dados: votes },
    votacoes: {
      dados: [
        {
          id: "p1",
          data: "2026-02-01",
          siglaOrgao: "PLEN",
          descricao: "Aprovado o PL.",
        },
        {
          id: "p2",
          data: "2026-04-01",
          siglaOrgao: "PLEN",
          descricao: "Rejeitado o requerimento.",
        },
        {
          id: "c1",
          data: "2026-04-02",
          siglaOrgao: "CCJC",
          descricao: "Aprovado o parecer.",
        },
      ],
    },
    votacoesProposicoes: {
      dados: [
        { idVotacao: "p1", proposicao_: { id: 10, titulo: "PL 1/2026" } },
      ],
    },
    proposicoesAutores: {
      dados: [
        { idProposicao: 10, idDeputadoAutor: 1, proponente: "1" },
        { idProposicao: 11, idDeputadoAutor: 1, proponente: "1" },
        { idProposicao: 11, idDeputadoAutor: 1, proponente: "1" },
        // Support signatures do not count as authorship.
        { idProposicao: 12, idDeputadoAutor: 2, proponente: "0" },
        // Non-deputy authors carry no deputy id.
        { idProposicao: 13, proponente: "1" },
      ],
    },
    orgaosDeputados: {
      dados: [
        membership(1, "CCJC", "Titular", "2023-03-01", ""),
        membership(1, "CCJC", "Presidente", "2025-03-01", ""),
        membership(1, "CFT", "Suplente", "2023-03-01", "2024-01-31"),
        membership(2, "CE", "Titular", "2099-01-01", ""),
      ],
    },
  };
  const photos = { 1: JPEG, 2: Buffer.from("<html>not found</html>"), 3: JPEG };
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const photo = url.pathname.match(/\/bandep\/(\d+)\.jpg$/);
    if (photo)
      return new Response(photos[photo[1]], {
        headers: {
          "content-type": photo[1] === "2" ? "text/html" : "image/jpeg",
        },
      });
    const bulk = url.pathname.match(/^\/arquivos\/(\w+)\/json\//);
    const body = routes[bulk ? bulk[1] : url.pathname];
    if (!body) throw new Error(`Unexpected request: ${url.href}`);
    return Response.json(body);
  };
}

async function inTemp(callback) {
  const directory = await mkdtemp(join(tmpdir(), "vigia-deputies-"));
  const cwd = process.cwd();
  try {
    process.chdir(directory);
    return await callback();
  } finally {
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
}

test("Deputy profiles count official records per deputy, rank them and publish only safe fields", () =>
  inTemp(async () => {
    // A photo of a deputy who left office must be removed.
    await mkdir("static/fotos/deputados", { recursive: true });
    await writeFile("static/fotos/deputados/99.jpg", JPEG);
    await syncDeputies({
      layer: makeCamaraLayer({ fetcher: fixture(), baseDelayMs: 0 }),
    });
    const body = await readFile("static/deputados.json", "utf8");
    assert.equal(body, await readFile("src/lib/data/deputies.json", "utf8"));
    for (const secret of [
      "12345678900",
      "1970-01-01",
      "gabinete@",
      "3215-0000",
    ])
      assert.equal(body.includes(secret), false, `published ${secret}`);
    const dataset = JSON.parse(body);
    const byId = Object.fromEntries(dataset.deputies.map((d) => [d.id, d]));
    assert.deepEqual(
      dataset.deputies.map((d) => d.id),
      [3, 1, 2],
    );
    assert.equal(dataset.legislature, 57);
    assert.deepEqual(dataset.nominalVotings, { plenary: 2, committee: 1 });

    assert.deepEqual(byId[1].counts, {
      plenaryVotes: 2,
      committeeVotes: 1,
      propositions: 2,
      speeches: 7,
      organs: 1,
    });
    assert.deepEqual(byId[2].counts, {
      plenaryVotes: 1,
      committeeVotes: 0,
      propositions: 0,
      speeches: 1,
      organs: 0,
    });
    assert.equal(byId[3].counts.speeches, 0);
    // Midrank: two deputies tied at zero share the lower third.
    assert.deepEqual(
      [3, 1, 2].map((id) => byId[id].percentiles.committeeVotes),
      [33, 83, 33],
    );
    assert.deepEqual(
      [3, 1, 2].map((id) => byId[id].percentiles.plenaryVotes),
      [17, 83, 50],
    );

    assert.deepEqual(
      byId[1].organs.map((o) => `${o.acronym}:${o.role}`),
      ["CCJC:Titular", "CCJC:Presidente"],
    );
    assert.deepEqual(byId[1].parties, [
      { party: "AAA", from: "2026-02-01", until: "2026-02-01" },
      { party: "BBB", from: "2026-04-01", until: "2026-04-02" },
    ]);
    // Only plenary votes, newest first.
    assert.deepEqual(
      byId[1].recentVotes.map((v) => [
        v.id,
        v.propositions.map((p) => p.label),
      ]),
      [
        ["p2", []],
        ["p1", ["PL 1/2026"]],
      ],
    );
    assert.equal(byId[3].condition, "Suplente");

    // Non-JPEG responses are never republished as photos.
    assert.equal(byId[1].photo, "/fotos/deputados/1.jpg");
    assert.equal(byId[2].photo, null);
    assert.deepEqual((await readdir("static/fotos/deputados")).sort(), [
      "1.jpg",
      "3.jpg",
    ]);
    assert.deepEqual(await readFile("static/fotos/deputados/1.jpg"), JPEG);
  }));

test("Repeated ballots stop the deputy collection and keep the previous files", () =>
  inTemp(async () => {
    await mkdir("static", { recursive: true });
    await writeFile("static/deputados.json", "previous");
    await assert.rejects(
      syncDeputies({
        layer: makeCamaraLayer({
          fetcher: fixture({ duplicateVote: true }),
          baseDelayMs: 0,
        }),
      }),
      /repetido/,
    );
    assert.equal(await readFile("static/deputados.json", "utf8"), "previous");
  }));
