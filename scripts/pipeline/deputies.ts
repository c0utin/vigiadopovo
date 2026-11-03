import { DateTime, Effect, Schema } from "effect";
import { Camara, type BulkFile } from "./camara.ts";
import { PipelineError } from "./errors.ts";
import type {
  ActivityKey,
  DeputiesDataset,
  Deputy,
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

export const ACTIVITY: DeputiesDataset["activity"] = [
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

const tally = (map: Map<number, number>, id: number) =>
  map.set(id, (map.get(id) ?? 0) + 1);

// Midrank percentile: ties share a position, so a zero shared by most
// deputies is not reported as the very bottom.
export function percentiles(values: readonly number[]) {
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

    const files: BulkFile[] = [];
    const bulk = <S extends Schema.Top>(schema: S, name: string) =>
      client.file(`${FILES}/${name}`).pipe(
        // Keep only the digest; the parsed export is large.
        Effect.tap((file) =>
          Effect.sync(() => files.push({ ...file, dados: null })),
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
      tally(isPlenary ? plenary : committee, vote.deputado_.id);
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
      const status = detail.ultimoStatus;
      const own = (byDeputy.get(id) ?? []).toSorted((a, b) =>
        (a.dataHoraVoto ?? "").localeCompare(b.dataHoraVoto ?? ""),
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
          a.acronym.localeCompare(b.acronym),
        ),
        parties,
        recentVotes: own
          .filter((v) => votingById.get(v.idVotacao)?.siglaOrgao === "PLEN")
          .slice(-10)
          .reverse()
          .map((vote) => {
            const voting = votingById.get(vote.idVotacao)!;
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
      };
    });

    return {
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
      sources: files.map(({ dados: _, ...file }) => file),
      deputies,
    } satisfies DeputiesDataset;
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
