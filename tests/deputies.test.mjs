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
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { makeCamaraLayer } from "../scripts/pipeline/camara.ts";
import { syncDeputies } from "../scripts/deputies.ts";

// Runs the collection against the fixture API, with the real file system.
const sync = (fetcher) =>
  syncDeputies.pipe(
    Effect.provide(makeCamaraLayer({ fetcher, baseDelayMs: 0 })),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );

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
  const member = (id, nome, siglaPartido, idLegislatura, siglaUf = "PE") => ({
    id,
    nome,
    siglaPartido,
    siglaUf,
    idLegislatura,
  });
  const bill = (id, siglaTipo, dataApresentacao, status) => ({
    id,
    siglaTipo,
    numero: id,
    ano: Number(dataApresentacao.slice(0, 4)),
    ementa: `Ementa ${id}`,
    dataApresentacao: `${dataApresentacao}T10:00:00`,
    ultimoStatus: {
      data: "2026-05-01T00:00:00",
      descricaoTramitacao: "Despacho",
      despacho: "",
      ...status,
    },
  });
  const routes = {
    "/api/v2/legislaturas/57": {
      dados: { id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
      links: [],
    },
    "/api/v2/legislaturas": {
      dados: [
        { id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
        { id: 56, dataInicio: "2019-02-01", dataFim: "2023-01-31" },
      ],
      links: [],
    },
    "mandatos:57": {
      dados: [
        member(1, "Ana", "AAA", 57),
        // A party change lists the deputy twice in the same legislature.
        member(1, "Ana", "BBB", 57),
        member(2, "Bruno", "AAA", 57),
        member(3, "Carla", "AAA", 57),
        // Left office during the legislature.
        member(7, "Davi", "CCC", 57, "SP"),
      ],
      links: [],
    },
    "mandatos:56": {
      dados: [
        member(1, "ANA", "OLD", 56),
        member(8, "ELISA", null, 56, "GB"),
        // Official inconsistency: another legislature, no name. Left out.
        member(9, null, null, 55),
      ],
      links: [],
    },
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
    "proposicoesAutores-2024": {
      dados: [20, 21, 22, 23, 24]
        .map((id) => ({
          idProposicao: id,
          idDeputadoAutor: 1,
          proponente: "1",
          ordemAssinatura: "1",
        }))
        .concat([
          // Support signature: not a co-author.
          { idProposicao: 24, idDeputadoAutor: 2, proponente: "0" },
        ]),
    },
    "proposicoesAutores-2023": {
      dados: [30, 31].map((id) => ({
        idProposicao: id,
        idDeputadoAutor: 2,
        proponente: "1",
        ordemAssinatura: "2",
      })),
    },
    // Yearly files without their own route have no bills.
    proposicoes: { dados: [] },
    "proposicoes-2026": {
      dados: [
        bill(10, "PL", "2026-03-01", {
          descricaoSituacao: "Aguardando Parecer",
        }),
        // Requests are not bills.
        bill(11, "REQ", "2026-03-02", { descricaoSituacao: "Aprovada" }),
      ],
    },
    "proposicoes-2024": {
      dados: [
        bill(20, "PL", "2024-01-10", {
          descricaoSituacao: "Transformado em Norma Jurídica",
        }),
        bill(21, "PEC", "2024-02-10", {
          descricaoSituacao: "Arquivada",
          despacho:
            "Arquivado nos termos do art. 133 do RICD (rejeição nas comissões de mérito).",
        }),
        bill(22, "PL", "2024-03-10", {
          descricaoSituacao: "Arquivada",
          despacho: "Arquivado nos termos do Artigo 105 do RICD.",
        }),
        // Blank situation: the last step says what happened.
        bill(23, "PDL", "2024-04-10", {
          descricaoSituacao: "",
          descricaoTramitacao: "Retirada pelo(a) Autor(a)",
        }),
        bill(24, "PLP", "2024-05-10", {
          descricaoSituacao: "Aguardando Apreciação pelo Senado Federal",
        }),
      ],
    },
    "proposicoes-2023": {
      dados: [
        // Presented before the legislature began.
        bill(30, "PL", "2023-01-20", {
          descricaoSituacao: "Aguardando Parecer",
        }),
        bill(31, "PL", "2023-02-02", {
          descricaoSituacao: "Tramitando em Conjunto",
        }),
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
    const bulk = url.pathname.match(
      /^\/arquivos\/(\w+)\/json\/([\w-]+)\.json$/,
    );
    const legislature = url.searchParams.get("idLegislatura");
    const body = bulk
      ? (routes[bulk[2]] ?? routes[bulk[1]])
      : routes[legislature ? `mandatos:${legislature}` : url.pathname];
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
    await sync(fixture());
    const body = await readFile("static/deputados.json", "utf8");
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

    // Bills of the whole legislature, newest first, by official situation.
    assert.equal(dataset.bills.since, "2023-02-01");
    assert.deepEqual(
      byId[1].bills.map((b) => [b.label, b.outcome, b.situation]),
      [
        ["PL 10/2026", "active", "Aguardando Parecer"],
        [
          "PLP 24/2024",
          "approved",
          "Aguardando Apreciação pelo Senado Federal",
        ],
        ["PDL 23/2024", "closed", "Retirada pelo(a) Autor(a)"],
        ["PL 22/2024", "closed", "Arquivada"],
        ["PEC 21/2024", "rejected", "Arquivada"],
        ["PL 20/2024", "law", "Transformado em Norma Jurídica"],
      ],
    );
    assert.deepEqual(
      byId[2].bills.map((b) => [b.id, b.firstAuthor, b.presentedAt]),
      [[31, false, "2023-02-02"]],
    );
    assert.equal(byId[1].bills[5].firstAuthor, true);
    assert.deepEqual(byId[3].bills, []);

    // Non-JPEG responses are never republished as photos.
    assert.equal(byId[1].photo, "/fotos/deputados/1.jpg");
    assert.equal(byId[2].photo, null);
    assert.deepEqual((await readdir("static/fotos/deputados")).sort(), [
      "1.jpg",
      "3.jpg",
    ]);
    assert.deepEqual(await readFile("static/fotos/deputados/1.jpg"), JPEG);

    const mandates = JSON.parse(
      await readFile("static/deputados-mandatos.json", "utf8"),
    );
    assert.deepEqual(
      mandates.legislatures.map((l) => [l.id, l.start, l.end]),
      [
        [57, "2023-02-01", "2027-01-31"],
        [56, "2019-02-01", "2023-01-31"],
      ],
    );
    const served = Object.fromEntries(mandates.deputies.map((d) => [d.id, d]));
    // Name and state from the newest mandate; parties per mandate.
    assert.deepEqual(served[1], {
      id: 1,
      name: "Ana",
      state: "PE",
      mandates: [
        { legislature: 57, state: "PE", parties: ["AAA", "BBB"] },
        { legislature: 56, state: "PE", parties: ["OLD"] },
      ],
    });
    assert.deepEqual(served[8].mandates, [
      { legislature: 56, state: "GB", parties: [] },
    ]);
    assert.ok(served[7], "former deputies of the current legislature are kept");
    assert.equal(served[9], undefined);
    assert.equal(mandates.excluded.rows, 1);
    assert.deepEqual(
      mandates.deputies.map((d) => d.name),
      ["Ana", "Bruno", "Carla", "Davi", "ELISA"],
    );
  }));

test("Repeated ballots stop the deputy collection and keep the previous files", () =>
  inTemp(async () => {
    await mkdir("static", { recursive: true });
    await writeFile("static/deputados.json", "previous");
    await assert.rejects(sync(fixture({ duplicateVote: true })), /repetido/);
    assert.equal(await readFile("static/deputados.json", "utf8"), "previous");
  }));
