import { DateTime, Effect, Schema } from "effect";
import { createHash } from "node:crypto";
import { Camara, type BulkFile } from "./camara.ts";
import { encodeCompact } from "./content.ts";
import { PipelineError } from "./errors.ts";
import {
  approvedPrincipal,
  formerLabel,
  mayBeRenumbered,
  billOutcome,
  BILL_TYPES,
  COPY_SIMILARITY,
  DOCUMENT_TYPES,
  keepsEmenta,
  LOCAL_FACTOR,
  LOW,
  plain,
  POINTS,
  readsDespacho,
  QUALITY_VERSION,
  REACH,
  REPORT_POINTS,
  REPORT_TYPES,
  scoreQuality,
  VARIANTS,
  type Document,
  type Proposition,
  type QualityInput,
} from "./quality.ts";
import type {
  ActivityKey,
  DeputiesDataset,
  Deputy,
  MandatesDataset,
} from "../../src/lib/deputies.ts";

const API = "https://dadosabertos.camara.leg.br/api/v2";
const FILES = "https://dadosabertos.camara.leg.br/arquivos";
const Id = Schema.Int.check(Schema.isGreaterThan(0));
const IdString = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);
const Text = Schema.NullOr(Schema.String);

const Listed = Schema.Struct({ id: Id, idLegislatura: Id });
const Detail = Schema.Struct({
  id: Id,
  nomeCivil: Text,
  ultimoStatus: Schema.Struct({
    id: Id,
    nome: Schema.NonEmptyString,
    nomeEleitoral: Text,
    siglaPartido: Text,
    siglaUf: Text,
    situacao: Text,
    condicaoEleitoral: Text,
    data: Text,
  }),
  escolaridade: Text,
  municipioNascimento: Text,
  ufNascimento: Text,
});
const Page = Schema.Struct({ rel: Schema.String, href: Schema.String });
const BulkVote = Schema.Struct({
  idVotacao: Schema.NonEmptyString,
  dataHoraVoto: Text,
  voto: Schema.String,
  deputado_: Schema.Struct({ id: IdString, siglaPartido: Text }),
});
const BulkVoting = Schema.Struct({
  id: Schema.NonEmptyString,
  data: Schema.NonEmptyString,
  siglaOrgao: Schema.NonEmptyString,
  descricao: Schema.String,
});
const BulkVotingProposition = Schema.Struct({
  idVotacao: Schema.NonEmptyString,
  proposicao_: Schema.Struct({ id: Id, titulo: Schema.NonEmptyString }),
});
const BulkAuthor = Schema.Struct({
  idProposicao: Id,
  // Absent when the author is not a deputy (committees, Executive, etc.).
  idDeputadoAutor: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  proponente: Schema.String,
  ordemAssinatura: Schema.optionalKey(Text),
});
const BulkProposition = Schema.Struct({
  id: Id,
  siglaTipo: Schema.String,
  numero: Schema.Int,
  ano: Schema.Int,
  ementa: Schema.String,
  dataApresentacao: Schema.NonEmptyString,
  uriPropPrincipal: Schema.optionalKey(Text),
  ultimoStatus: Schema.Struct({
    data: Text,
    descricaoSituacao: Text,
    descricaoTramitacao: Text,
    despacho: Text,
    uriRelator: Schema.optionalKey(Text),
  }),
});
const PropositionKey = {
  id: Id,
  siglaTipo: Schema.String,
  numero: Schema.Int,
  ano: Schema.Int,
};
const ListedProposition = Schema.Struct(PropositionKey);
const PropositionStatus = Schema.Struct({
  ...PropositionKey,
  ementa: Schema.String,
  dataApresentacao: Schema.NonEmptyString,
  statusProposicao: Schema.Struct({
    descricaoSituacao: Text,
    descricaoTramitacao: Text,
    despacho: Text,
    uriUltimoRelator: Schema.optionalKey(Text),
  }),
});
const Step = Schema.Struct({ sequencia: Schema.Int, despacho: Text });
const LegislatureDetail = Schema.Struct({
  id: Id,
  dataInicio: Schema.NonEmptyString,
});
const BulkMembership = Schema.Struct({
  uriOrgao: Schema.String,
  siglaOrgao: Schema.NonEmptyString,
  nomePublicacaoOrgao: Schema.String,
  uriDeputado: Schema.String,
  cargo: Schema.NonEmptyString,
  dataInicio: Schema.String,
  dataFim: Schema.String,
});

const Legislature = Schema.Struct({
  id: Id,
  dataInicio: Schema.NonEmptyString,
  dataFim: Text,
});
// One row per deputy and party in the legislature: a party change in the
// middle of a mandate lists the deputy twice. A few rows come back under a
// legislature other than their own idLegislatura, always without a name.
const Member = Schema.Struct({
  id: Id,
  nome: Text,
  siglaPartido: Text,
  siglaUf: Text,
  idLegislatura: Id,
});

const ACTIVITY: DeputiesDataset["activity"] = [
  {
    key: "plenaryVotes",
    short: "Plenário",
    label: "Votos no Plenário",
    description:
      "Registros individuais em votações nominais do Plenário no ano. Quem não votou não aparece na lista oficial; ausência não é inferida.",
  },
  {
    key: "committeeVotes",
    short: "Comissões",
    label: "Votos em comissões",
    description:
      "Registros individuais em votações nominais de comissões e outros órgãos no ano.",
  },
  {
    key: "propositions",
    short: "Proposições",
    label: "Proposições",
    description:
      "Proposições apresentadas no ano como autor ou coautor proponente, de qualquer tipo, inclusive requerimentos. Apoiamentos não contam.",
  },
  {
    key: "speeches",
    short: "Discursos",
    label: "Discursos",
    description: "Discursos registrados pela Câmara no ano.",
  },
  {
    key: "organs",
    short: "Órgãos",
    label: "Órgãos",
    description:
      "Comissões, Mesa e outros órgãos em que atua hoje, como titular, suplente ou em outro cargo.",
  },
];

const BILLS: DeputiesDataset["bills"]["outcomes"] = [
  {
    key: "law",
    label: "Virou lei",
    description: "Situação oficial “Transformado em Norma Jurídica”.",
  },
  {
    key: "lawVia",
    label: "Virou lei por outro projeto",
    description:
      "Anexado a outro projeto, foi declarado prejudicado quando a Câmara aprovou esse projeto ou o substitutivo dele, que depois virou lei. A lei pode ou não incluir o conteúdo deste projeto.",
  },
  {
    key: "approved",
    label: "Aprovada na Câmara",
    description:
      "Aguarda redação final, o Senado, sanção ou promulgação: a Câmara já aprovou o texto, mas ainda não é lei.",
  },
  {
    key: "approvedVia",
    label: "Aprovada na Câmara por outro projeto",
    description:
      "Anexado a outro projeto, foi declarado prejudicado quando a Câmara aprovou esse projeto ou o substitutivo dele, que ainda não é lei. Conta como aprovado pela situação oficial, pela redação final publicada ou por veto. O texto aprovado pode ou não incluir o conteúdo deste projeto.",
  },
  {
    key: "rejected",
    label: "Rejeitada",
    description:
      "Situação oficial “Rejeitada” ou “Vetada totalmente”, ou arquivada com despacho que cita rejeição.",
  },
  {
    key: "active",
    label: "Em tramitação",
    description:
      "Aguardando relator, parecer, pauta ou outra etapa, inclusive tramitando em conjunto com outro projeto.",
  },
  {
    key: "closed",
    label: "Arquivada ou retirada",
    description:
      "Arquivada sem rejeição (por exemplo, no fim da legislatura ou por prejudicialidade), devolvida, retirada pelo autor ou sem eficácia.",
  },
];
const KINDS: DeputiesDataset["bills"]["kinds"] = [
  {
    key: "honorific",
    label: "Honorífico",
    description:
      "Datas comemorativas, títulos (como “Capital Nacional”), nomes de rodovias e obras, patronos, heróis da Pátria, medalhas e reconhecimento cultural.",
  },
  {
    key: "sustacao",
    label: "Sustação de ato",
    description:
      "Projeto de decreto legislativo que susta um ato do Executivo, como decreto, portaria ou resolução.",
  },
  {
    key: "other",
    label: "Demais projetos",
    description: "Todos os outros projetos.",
  },
];

/** Site path of the published scoring input. */
export const QUALITY_INPUT = "/deputados-qualidade-entrada.json";
const STAGES: DeputiesDataset["quality"]["stages"] = [
  {
    key: "presented",
    label: "Apresentado",
    description: "Protocolado, sem relator registrado.",
  },
  {
    key: "rapporteur",
    label: "Com relator",
    description:
      "Relator designado no último status, ou situação que pressupõe relator (aguardando parecer, pronta para pauta, vistas).",
  },
  {
    key: "opinion",
    label: "Com parecer",
    description:
      "Há parecer de relator ou de comissão sobre o projeto no arquivo oficial de proposições.",
  },
  {
    key: "committee",
    label: "Aprovado em comissão",
    description:
      "Substitutivo adotado por comissão, ou parecer de comissão com voto do relator pela aprovação ou admissibilidade.",
  },
  {
    key: "camara",
    label: "Aprovado na Câmara",
    description:
      "Situação no Senado, sanção, veto, promulgação ou redação final, ou redação final publicada: a Câmara aprovou o texto.",
  },
  {
    key: "law",
    label: "Virou lei",
    description: "Situação oficial “Transformado em Norma Jurídica”.",
  },
];
const REASONS: DeputiesDataset["quality"]["reasons"] = [
  {
    key: "honorific",
    label: "Honorífico",
    description:
      "Data comemorativa, título, nome de obra ou honraria (regras da classificação “Honorífico”). Peso 0,1.",
    source:
      "Lei nº 12.345/2010: datas comemorativas só por alta significação para a sociedade, com consultas e audiências públicas prévias.",
  },
  {
    key: "authorizing",
    label: "Autorizativo",
    description:
      "Ementa que começa por “Autoriza o Poder Executivo” (ou a União, o Governo Federal): só autoriza o que o Executivo já pode fazer. Peso 0,1.",
    source:
      "Súmula de Jurisprudência nº 1 da Comissão de Constituição e Justiça e de Cidadania da Câmara.",
  },
  {
    key: "concession",
    label: "Homologação de concessão",
    description:
      "Projeto de decreto legislativo que aprova ato de concessão, permissão ou autorização de rádio ou TV. Peso 0,1.",
    source:
      "Constituição, art. 223: o Congresso aprecia o ato do Executivo; o projeto não cria regra nova.",
  },
  {
    key: "local",
    label: "Alcance local",
    description:
      "Ementa que nomeia um município (“no município de…”). Peso multiplicado por 0,3.",
    source:
      "Generalidade da lei, primeiro dos oito princípios de legalidade de Lon Fuller (The Morality of Law, 1964).",
  },
  {
    key: "copy",
    label: "Cópia de projeto anterior",
    description:
      "Mesmo tipo, os mesmos números citados e ao menos 90% das mesmas palavras de conteúdo da ementa de um projeto apresentado antes, inclusive do mesmo autor. Ementas genéricas (“Altera a Lei X” sem finalidade) nunca contam como cópia. Peso 0; o crédito fica com o projeto original.",
    source:
      "Lei Complementar nº 95/1998, art. 7º, IV: o mesmo assunto não pode ser disciplinado por mais de uma lei.",
  },
  {
    key: "returned",
    label: "Devolvida",
    description: "Situação oficial “Devolvida ao Autor”. Peso 0.",
    source:
      "Regimento Interno da Câmara, art. 137, § 1º: a Presidência devolve proposição sem os requisitos formais ou evidentemente inconstitucional.",
  },
];

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Midrank percentile: ties share a position, so a zero shared by most
// deputies is not reported as the very bottom.
function percentiles(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return values.map((value) => {
    let less = 0;
    while (less < sorted.length && sorted[less] < value) less++;
    let equal = 0;
    while (sorted[less + equal] === value) equal++;
    return Math.round(((less + equal / 2) / sorted.length) * 100);
  });
}

const decode = <S extends Schema.Top>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(Schema.Array(schema))(value);

export const collectDeputies = Effect.fn("collectDeputies")(
  function* () {
    const client = yield* Camara;
    const now = yield* DateTime.now;
    const collectedAt = DateTime.formatIso(now);
    const today = DateTime.formatIsoDate(
      DateTime.setZoneNamedUnsafe(now, "America/Sao_Paulo"),
    );
    const year = Number(today.slice(0, 4));

    // The default list is the deputies currently in office.
    const listed = yield* client
      .all(`${API}/deputados?itens=100&ordem=ASC&ordenarPor=nome`)
      .pipe(Effect.flatMap((items) => decode(Listed, items)));
    const legislatures = new Set(listed.map((d) => d.idLegislatura));
    if (!listed.length || legislatures.size !== 1)
      return yield* new PipelineError({
        stage: "validation",
        message:
          "Lista de deputados em exercício vazia ou com legislaturas mistas",
      });
    const legislature = [...legislatures][0];
    if (new Set(listed.map((d) => d.id)).size !== listed.length)
      return yield* new PipelineError({
        stage: "validation",
        message: "Deputado repetido na lista oficial",
      });

    const files: Omit<BulkFile, "dados">[] = [];
    const bulk = <S extends Schema.Top>(schema: S, name: string) =>
      client.file(`${FILES}/${name}`).pipe(
        // Keep only the digest; the parsed export is large.
        Effect.tap(({ dados: _, ...source }) =>
          Effect.sync(() => files.push(source)),
        ),
        Effect.flatMap((file) => decode(schema, file.dados)),
      );
    const votes = yield* bulk(
      BulkVote,
      `votacoesVotos/json/votacoesVotos-${year}.json`,
    );
    const votings = yield* bulk(
      BulkVoting,
      `votacoes/json/votacoes-${year}.json`,
    );
    const votingPropositions = yield* bulk(
      BulkVotingProposition,
      `votacoesProposicoes/json/votacoesProposicoes-${year}.json`,
    );
    const authors = yield* bulk(
      BulkAuthor,
      `proposicoesAutores/json/proposicoesAutores-${year}.json`,
    );
    const memberships = yield* bulk(
      BulkMembership,
      `orgaosDeputados/json/orgaosDeputados-L${legislature}.json`,
    );

    // Bills of the whole legislature: the yearly files are by presentation
    // year, and a bill takes years to reach a final outcome.
    const term = yield* client
      .get(`${API}/legislaturas/${legislature}`)
      .pipe(
        Effect.flatMap((r) =>
          Schema.decodeUnknownEffect(LegislatureDetail)(r.dados),
        ),
      );
    const since = term.dataInicio.slice(0, 10);
    const sitting = new Set(listed.map((d) => d.id));
    // The scoring input: every bill and opinion document of the bulk years,
    // with deputy signers. Collection stops here; every rule is applied by
    // scoreQuality, which reads nothing else.
    const propositions = new Map<number, Proposition>();
    const statusAt = new Map<number, string | null>();
    const documents: Document[] = [];
    const ids = (values: readonly number[]) =>
      [...new Set(values)].sort((a, b) => a - b);
    for (
      let billYear = Number(since.slice(0, 4));
      billYear <= year;
      billYear++
    ) {
      const yearAuthors =
        billYear === year
          ? authors
          : yield* bulk(
              BulkAuthor,
              `proposicoesAutores/json/proposicoesAutores-${billYear}.json`,
            );
      const signers = new Map<number, (typeof BulkAuthor.Type)[]>();
      for (const author of yearAuthors) {
        if (author.idDeputadoAutor == null) continue;
        const list = signers.get(author.idProposicao) ?? [];
        list.push(author);
        signers.set(author.idProposicao, list);
      }
      for (const p of yield* bulk(
        BulkProposition,
        `proposicoes/json/proposicoes-${billYear}.json`,
      )) {
        const rows = signers.get(p.id) ?? [];
        const status = p.ultimoStatus;
        if (p.siglaTipo in REACH) {
          const proponents = rows.filter((a) => a.proponente === "1");
          propositions.set(p.id, {
            id: p.id,
            type: p.siglaTipo,
            number: p.numero,
            year: p.ano,
            ementa: p.ementa,
            presentedAt: p.dataApresentacao.slice(0, 10),
            situation:
              status.descricaoSituacao || status.descricaoTramitacao || null,
            despacho: null,
            relator: Boolean(status.uriRelator),
            proponents: ids(proponents.map((a) => a.idDeputadoAutor!)),
            first:
              proponents.find((a) => a.ordemAssinatura === "1")
                ?.idDeputadoAutor ?? null,
            steps: [],
          });
          const situation = propositions.get(p.id)!.situation ?? "";
          if (readsDespacho(situation))
            propositions.get(p.id)!.despacho = status.despacho || null;
          statusAt.set(p.id, status.data?.slice(0, 10) || null);
        } else if (DOCUMENT_TYPES.includes(p.siglaTipo) && p.uriPropPrincipal) {
          const principal = Number(p.uriPropPrincipal.split("/").at(-1));
          if (Number.isSafeInteger(principal) && principal > 0)
            documents.push({
              id: p.id,
              principal,
              type: p.siglaTipo,
              ementa: keepsEmenta(p.siglaTipo) ? p.ementa : "",
              authors: REPORT_TYPES.includes(p.siglaTipo)
                ? ids(rows.map((a) => a.idDeputadoAutor!))
                : [],
            });
        }
      }
    }

    // Principals outside the bulk years, read from the API and added to the
    // input: those named by an archived bill's despacho, and those with a
    // sitting rapporteur and a final text (the Câmara approved them).
    const fromApi = (r: { dados: unknown }) =>
      Schema.decodeUnknownEffect(PropositionStatus)(r.dados).pipe(
        Effect.map(({ statusProposicao: status, ...p }): Proposition => ({
          id: p.id,
          type: p.siglaTipo,
          number: p.numero,
          year: p.ano,
          ementa: p.ementa,
          presentedAt: p.dataApresentacao.slice(0, 10),
          situation:
            status.descricaoSituacao || status.descricaoTramitacao || null,
          despacho: status.despacho || null,
          relator: Boolean(status.uriUltimoRelator),
          proponents: [],
          first: null,
          steps: [],
        })),
      );
    // A renumbered proposition's old number is only in its own steps; the
    // API no longer finds it by that number.
    const withSteps = (list: readonly Proposition[]) =>
      Effect.forEach(
        list.filter(mayBeRenumbered),
        (p) =>
          client.get(`${API}/proposicoes/${p.id}/tramitacoes`).pipe(
            Effect.flatMap((r) => decode(Step, r.dados)),
            Effect.map((steps) => {
              p.steps = steps
                .toSorted((a, b) => a.sequencia - b.sequencia)
                .flatMap((s) => (s.despacho ? [s.despacho] : []));
            }),
          ),
        { concurrency: 4, discard: true },
      );
    yield* withSteps([...propositions.values()]);
    const known = new Set(
      [...propositions.values()].flatMap((p) => {
        const former = mayBeRenumbered(p) ? formerLabel(p, p.steps) : null;
        return [`${p.type} ${p.number}/${p.year}`, ...(former ? [former] : [])];
      }),
    );
    const named = new Map<
      string,
      { type: string; number: number; year: number }
    >();
    for (const p of propositions.values()) {
      if (!p.proponents.length || p.presentedAt < since) continue;
      if (billOutcome(p.situation ?? "", p.despacho ?? "") !== "closed")
        continue;
      const ref = approvedPrincipal(p.despacho ?? "");
      const key = ref && `${ref.type} ${ref.number}/${ref.year}`;
      if (ref && key && !known.has(key)) named.set(key, ref);
    }
    const finals = new Set(
      documents
        .filter((d) => d.type === "RDF" || d.type === "PARF")
        .map((d) => d.principal),
    );
    const reported = ids(
      documents
        .filter(
          (d) =>
            REPORT_TYPES.includes(d.type) &&
            finals.has(d.principal) &&
            !propositions.has(d.principal) &&
            d.authors.some((id) => sitting.has(id)),
        )
        .map((d) => d.principal),
    );
    const external = [
      ...(yield* Effect.forEach(
        [...named.values()],
        Effect.fnUntraced(function* ({ type, number, year }) {
          const found = yield* client
            .get(
              `${API}/proposicoes?siglaTipo=${type}&numero=${number}&ano=${year}`,
            )
            .pipe(Effect.flatMap((r) => decode(ListedProposition, r.dados)));
          const match = found.find(
            (p) =>
              p.siglaTipo === type && p.numero === number && p.ano === year,
          );
          if (!match) return [];
          return [
            yield* client
              .get(`${API}/proposicoes/${match.id}`)
              .pipe(Effect.flatMap(fromApi)),
          ];
        }),
        { concurrency: 4 },
      )).flat(),
      ...(yield* Effect.forEach(
        reported,
        (id) =>
          client.get(`${API}/proposicoes/${id}`).pipe(Effect.flatMap(fromApi)),
        { concurrency: 4 },
      )),
    ];
    const added = external.filter((p) => !propositions.has(p.id));
    yield* withSteps(added);
    for (const p of added) propositions.set(p.id, p);

    const qualityInput: QualityInput = {
      version: QUALITY_VERSION,
      asOf: today,
      since,
      deputies: ids([...sitting]),
      propositions: [...propositions.values()].sort((a, b) => a.id - b.id),
      // Opinions on propositions no source describes are never read.
      documents: documents
        .filter((d) => propositions.has(d.principal))
        .sort((a, b) => a.id - b.id),
    };
    const quality = yield* Effect.try({
      try: () => scoreQuality(qualityInput),
      catch: (error) =>
        new PipelineError({
          stage: "validation",
          message: error instanceof Error ? error.message : String(error),
        }),
    });
    const sha256 = (value: unknown) =>
      createHash("sha256").update(encodeCompact(value)).digest("hex");
    const billsByDeputy = new Map<number, Deputy["bills"]>();
    for (const b of quality.bills) {
      const p = propositions.get(b.id)!;
      for (const id of b.credited) {
        const list = billsByDeputy.get(id) ?? [];
        list.push({
          id: b.id,
          label: `${p.type} ${p.number}/${p.year}`,
          ementa: p.ementa,
          presentedAt: p.presentedAt,
          situation: p.situation,
          statusAt: statusAt.get(b.id) ?? null,
          outcome: b.outcome,
          kind: b.kind,
          via: b.via,
          firstAuthor: p.first === id,
          quality: {
            stage: b.stage,
            reasons: b.reasons,
            copyOf: b.copyOf,
            calc: b.base
              ? {
                  weight: b.weight,
                  base: b.base,
                  pool: b.pool,
                  proponents: b.credited.length,
                }
              : null,
            share: b.share,
          },
        });
        billsByDeputy.set(id, list);
      }
    }
    const reportsByDeputy = new Map<number, Deputy["score"]["reports"]>();
    for (const r of quality.reports)
      for (const id of r.rapporteurs) {
        const list = reportsByDeputy.get(id) ?? [];
        list.push({
          id: r.id,
          label: r.label,
          stage: r.stage,
          weight: r.weight,
          base: r.base,
          rapporteurs: r.rapporteurs.length,
          share: r.share,
        });
        reportsByDeputy.set(id, list);
      }
    const scores = new Map(quality.deputies.map((d) => [d.id, d]));

    const votingById = new Map(votings.map((v) => [v.id, v]));
    const propositionsByVoting = new Map<
      string,
      { id: number; label: string }[]
    >();
    for (const { idVotacao, proposicao_ } of votingPropositions) {
      const list = propositionsByVoting.get(idVotacao) ?? [];
      if (!list.some((p) => p.id === proposicao_.id))
        list.push({ id: proposicao_.id, label: proposicao_.titulo });
      propositionsByVoting.set(idVotacao, list);
    }

    const plenary = new Map<number, number>();
    const committee = new Map<number, number>();
    const nominal = {
      plenary: new Set<string>(),
      committee: new Set<string>(),
    };
    const byDeputy = new Map<number, (typeof votes)[number][]>();
    const seen = new Set<string>();
    for (const vote of votes) {
      const voting = votingById.get(vote.idVotacao);
      if (!voting)
        return yield* new PipelineError({
          stage: "validation",
          message: "Voto sem votação correspondente no arquivo oficial do ano",
        });
      const key = `${vote.idVotacao}:${vote.deputado_.id}`;
      // Same rule as the proposal collection: never pick one of two records.
      if (seen.has(key))
        return yield* new PipelineError({
          stage: "validation",
          message: "Registro repetido do mesmo deputado na mesma votação",
        });
      seen.add(key);
      const isPlenary = voting.siglaOrgao === "PLEN";
      const bucket = isPlenary ? plenary : committee;
      bucket.set(vote.deputado_.id, (bucket.get(vote.deputado_.id) ?? 0) + 1);
      (isPlenary ? nominal.plenary : nominal.committee).add(vote.idVotacao);
      const list = byDeputy.get(vote.deputado_.id) ?? [];
      list.push(vote);
      byDeputy.set(vote.deputado_.id, list);
    }

    const authored = new Map<number, Set<number>>();
    for (const author of authors) {
      if (author.proponente !== "1" || author.idDeputadoAutor == null) continue;
      const set = authored.get(author.idDeputadoAutor) ?? new Set();
      set.add(author.idProposicao);
      authored.set(author.idDeputadoAutor, set);
    }

    const organsByDeputy = new Map<number, Deputy["organs"][number][]>();
    for (const m of memberships) {
      if (m.dataFim && m.dataFim.slice(0, 10) < today) continue;
      if (m.dataInicio.slice(0, 10) > today) continue;
      const id = Number(m.uriDeputado.split("/").at(-1));
      if (!Number.isSafeInteger(id)) continue;
      const list = organsByDeputy.get(id) ?? [];
      list.push({
        acronym: m.siglaOrgao,
        name: m.nomePublicacaoOrgao || m.siglaOrgao,
        role: m.cargo,
        since: m.dataInicio.slice(0, 10) || null,
      });
      organsByDeputy.set(id, list);
    }

    const profiles = yield* Effect.forEach(
      listed,
      Effect.fnUntraced(function* ({ id }) {
        const response = yield* client.get(`${API}/deputados/${id}`);
        const detail = yield* Schema.decodeUnknownEffect(Detail)(
          response.dados,
        );
        if (detail.id !== id || detail.ultimoStatus.id !== id)
          return yield* new PipelineError({
            stage: "collection",
            message: "ID retornado pela Câmara não corresponde ao solicitado",
          });
        // itens=1 makes the "last" page number equal to the total count.
        const speeches = yield* client.get(
          `${API}/deputados/${id}/discursos?dataInicio=${year}-01-01&dataFim=${today}&itens=1`,
        );
        const speechItems = yield* decode(Schema.Unknown, speeches.dados);
        const last = (yield* decode(Page, speeches.links ?? [])).find(
          (link) => link.rel === "last",
        );
        const lastPage = last
          ? Number(new URL(last.href).searchParams.get("pagina"))
          : 1;
        if (!Number.isSafeInteger(lastPage) || lastPage < 1)
          return yield* new PipelineError({
            stage: "validation",
            message: "Paginação de discursos inválida",
          });
        return { detail, speeches: speechItems.length ? lastPage : 0 };
      }),
      { concurrency: 4 },
    );

    const counts = profiles.map(({ detail, speeches }) => {
      const id = detail.id;
      return {
        plenaryVotes: plenary.get(id) ?? 0,
        committeeVotes: committee.get(id) ?? 0,
        propositions: authored.get(id)?.size ?? 0,
        speeches,
        organs: new Set((organsByDeputy.get(id) ?? []).map((o) => o.acronym))
          .size,
      } satisfies Record<ActivityKey, number>;
    });
    const ranks = Object.fromEntries(
      ACTIVITY.map(({ key }) => [key, percentiles(counts.map((c) => c[key]))]),
    ) as Record<ActivityKey, number[]>;

    const deputies: Deputy[] = profiles.map(({ detail }, index) => {
      const id = detail.id;
      const score = scores.get(id)!;
      const status = detail.ultimoStatus;
      const own = (byDeputy.get(id) ?? []).toSorted((a, b) =>
        compare(a.dataHoraVoto ?? "", b.dataHoraVoto ?? ""),
      );
      const parties: Deputy["parties"] = [];
      for (const vote of own) {
        const party = vote.deputado_.siglaPartido;
        const date = (vote.dataHoraVoto ?? "").slice(0, 10) || null;
        if (!party) continue;
        const current = parties.at(-1);
        if (current?.party === party) current.until = date;
        else parties.push({ party, from: date, until: date });
      }
      return {
        id,
        name: status.nomeEleitoral || status.nome,
        civilName: detail.nomeCivil,
        party: status.siglaPartido,
        state: status.siglaUf,
        status: status.situacao,
        condition: status.condicaoEleitoral,
        statusSince: status.data,
        schooling: detail.escolaridade,
        birthplace: detail.municipioNascimento
          ? [detail.municipioNascimento, detail.ufNascimento]
              .filter(Boolean)
              .join(" · ")
          : null,
        photo: null,
        profileUrl: `https://www.camara.leg.br/deputados/${id}`,
        apiUrl: `${API}/deputados/${id}`,
        counts: counts[index],
        percentiles: Object.fromEntries(
          ACTIVITY.map(({ key }) => [key, ranks[key][index]]),
        ) as Record<ActivityKey, number>,
        organs: (organsByDeputy.get(id) ?? []).toSorted((a, b) =>
          compare(a.acronym, b.acronym),
        ),
        parties,
        recentVotes: own
          .flatMap((vote) => {
            const voting = votingById.get(vote.idVotacao);
            return voting?.siglaOrgao === "PLEN" ? [{ vote, voting }] : [];
          })
          .slice(-10)
          .reverse()
          .map(({ vote, voting }) => {
            return {
              id: vote.idVotacao,
              date: vote.dataHoraVoto ?? voting.data,
              vote: vote.voto,
              description: voting.descricao,
              propositions: (
                propositionsByVoting.get(vote.idVotacao) ?? []
              ).slice(0, 3),
              url: `${API}/votacoes/${vote.idVotacao}`,
            };
          }),
        bills: (billsByDeputy.get(id) ?? []).toSorted(
          (a, b) => compare(b.presentedAt, a.presentedAt) || b.id - a.id,
        ),
        score: {
          points: score.points,
          authorPoints: score.authorPoints,
          reportPoints: score.reportPoints,
          rank: score.rank,
          rankRange: score.rankRange,
          reports: (reportsByDeputy.get(id) ?? []).toSorted(
            (a, b) => b.share - a.share || a.id - b.id,
          ),
        },
      };
    });

    const dataset = {
      schemaVersion: 1,
      collectedAt,
      year,
      legislature,
      coverage: `Câmara dos Deputados · ${deputies.length} deputados em exercício · atividade de ${year}`,
      nominalVotings: {
        plenary: nominal.plenary.size,
        committee: nominal.committee.size,
      },
      activity: ACTIVITY,
      bills: { since, types: BILL_TYPES, outcomes: BILLS, kinds: KINDS },
      quality: {
        version: QUALITY_VERSION,
        asOf: today,
        input: QUALITY_INPUT,
        inputSha256: sha256(qualityInput),
        outputSha256: sha256(quality),
        stages: STAGES,
        reasons: REASONS,
        weights: { reach: REACH, low: LOW, local: LOCAL_FACTOR },
        points: POINTS,
        reportPoints: REPORT_POINTS,
        copySimilarity: COPY_SIMILARITY,
        variants: VARIANTS.map(({ key, label }) => ({ key, label })),
        unresolvedPrincipals: quality.unresolvedPrincipals,
      },
      sources: files,
      deputies,
    } satisfies DeputiesDataset;
    return { dataset, qualityInput };
  },
  Effect.catchTag("SchemaError", () =>
    Effect.fail(
      new PipelineError({
        stage: "validation",
        message:
          "Dados oficiais de deputados incompatíveis com o contrato esperado",
      }),
    ),
  ),
);

// Every deputy who served in any legislature since 1826, from the
// per-legislature lists of /deputados. Only name, state and the parties the
// Câmara lists for each mandate; no personal data.
export const collectMandates = Effect.fn("collectMandates")(
  function* () {
    const client = yield* Camara;
    const collectedAt = DateTime.formatIso(yield* DateTime.now);
    const legislatures = yield* client
      .all(`${API}/legislaturas?itens=100&ordem=DESC&ordenarPor=id`)
      .pipe(Effect.flatMap((items) => decode(Legislature, items)));
    if (
      !legislatures.length ||
      new Set(legislatures.map((l) => l.id)).size !== legislatures.length
    )
      return yield* new PipelineError({
        stage: "validation",
        message: "Lista de legislaturas vazia ou repetida",
      });
    const lists = yield* Effect.forEach(
      legislatures,
      ({ id }) =>
        client
          .all(
            `${API}/deputados?idLegislatura=${id}&itens=100&ordem=ASC&ordenarPor=nome`,
          )
          .pipe(Effect.flatMap((items) => decode(Member, items))),
      { concurrency: 4 },
    );
    const byId = new Map<number, MandatesDataset["deputies"][number]>();
    let excluded = 0;
    // Newest legislature first, so name and state are the latest ones.
    for (const [index, members] of lists.entries()) {
      const legislature = legislatures[index].id;
      for (const member of members) {
        // Which mandate such a row belongs to is unknowable: it is counted
        // in `excluded`, never assigned to either legislature.
        if (member.idLegislatura !== legislature) {
          excluded++;
          continue;
        }
        if (!member.nome)
          return yield* new PipelineError({
            stage: "validation",
            message: "Deputado sem nome na lista da própria legislatura",
          });
        const deputy = byId.get(member.id) ?? {
          id: member.id,
          name: member.nome,
          state: member.siglaUf,
          mandates: [],
        };
        let mandate = deputy.mandates.find(
          (m) => m.legislature === legislature,
        );
        if (!mandate) {
          mandate = { legislature, state: member.siglaUf, parties: [] };
          deputy.mandates.push(mandate);
        }
        if (
          member.siglaPartido &&
          !mandate.parties.includes(member.siglaPartido)
        )
          mandate.parties.push(member.siglaPartido);
        byId.set(member.id, deputy);
      }
    }
    return {
      schemaVersion: 1,
      collectedAt,
      legislatures: legislatures.map((l) => ({
        id: l.id,
        start: l.dataInicio.slice(0, 10),
        end: l.dataFim?.slice(0, 10) || null,
      })),
      excluded: {
        rows: excluded,
        reason:
          "Linhas devolvidas na lista de uma legislatura com outra idLegislatura e sem nome; não atribuídas a nenhum mandato.",
      },
      deputies: [...byId.values()].sort(
        (a, b) => compare(plain(a.name), plain(b.name)) || a.id - b.id,
      ),
    } satisfies MandatesDataset;
  },
  Effect.catchTag("SchemaError", () =>
    Effect.fail(
      new PipelineError({
        stage: "validation",
        message:
          "Lista oficial de mandatos incompatível com o contrato esperado",
      }),
    ),
  ),
);
