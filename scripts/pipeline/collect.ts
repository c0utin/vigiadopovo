import { createHash } from "node:crypto";
import { DateTime, Effect, Schema } from "effect";
import { Camara, officialUrl, OfficialUrlString } from "./camara.ts";
import { Snapshot } from "./content.ts";
import { PipelineError } from "./errors.ts";
import {
  collectBallots,
  collectLabels,
  redactBallotContacts,
  VotingDetail,
} from "./legislative.ts";
import type { LegislativeDataset } from "../../src/lib/legislative.ts";

const API = "https://dadosabertos.camara.leg.br/api/v2";
const Id = Schema.Int.check(Schema.isGreaterThan(0));
const Reference = Schema.Struct({ id: Id });
const VoteReference = Schema.Struct({ id: Schema.NonEmptyString });
const Proposal = Schema.Struct({
  id: Id,
  siglaTipo: Schema.NonEmptyString,
  numero: Schema.Int,
  ano: Schema.Int,
  descricaoTipo: Schema.NonEmptyString,
  ementa: Schema.NonEmptyString,
  dataApresentacao: Schema.NonEmptyString,
  uri: OfficialUrlString,
  urlInteiroTeor: Schema.NullOr(
    Schema.Union([OfficialUrlString, Schema.Literal("")]),
  ),
  statusProposicao: Snapshot.fields.propositions.value.fields.status,
});
const Author = Schema.Struct({
  nome: Schema.NonEmptyString,
  tipo: Schema.NonEmptyString,
});
const Vote = Schema.Struct({
  id: Schema.NonEmptyString,
  data: Schema.NonEmptyString,
  descricao: Schema.NonEmptyString,
  siglaOrgao: Schema.NonEmptyString,
  uri: OfficialUrlString,
});
const Summary = Schema.Struct({
  sourceHash: Schema.String,
  title: Schema.NonEmptyString,
  text: Schema.NonEmptyString,
  topic: Schema.NonEmptyString,
  generatedAt: Schema.NonEmptyString,
});
type Summaries = Readonly<Record<string, unknown>>;

export function sourceHash(proposition: { id: number; ementa: string }) {
  return createHash("sha256")
    .update(JSON.stringify([proposition.id, proposition.ementa]))
    .digest("hex");
}
export function attachSummary(
  proposition: { id: number; ementa: string },
  summaries: Summaries,
) {
  const candidate = summaries[proposition.id];
  if (!candidate) return null;
  const reference = Schema.decodeUnknownSync(
    Schema.Struct({ sourceHash: Schema.String }),
  )(candidate);
  if (reference.sourceHash !== sourceHash(proposition)) return null;
  const summary = Schema.decodeUnknownSync(Summary)(candidate);
  Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(summary.generatedAt);
  return {
    ...summary,
    scope: "ementa",
    method: "Inferência neste chat · sem revisão humana",
  };
}

export const collect = Effect.fn("collect")(
  function* ({
    previous = { propositions: [] },
    summaries = {},
    ids: requestedIds = [],
  }: {
    previous?: { propositions: readonly { id: number }[] };
    summaries?: Summaries;
    ids?: readonly number[];
  }) {
    const client = yield* Camara;
    const now = yield* DateTime.now;
    const collectedAt = DateTime.formatIso(now);
    const today = DateTime.formatIsoDate(
      DateTime.setZoneNamedUnsafe(now, "America/Sao_Paulo"),
    );
    const recent = yield* client.get(
      `${API}/proposicoes?siglaTipo=PL&ano=${today.slice(0, 4)}&itens=6&ordem=DESC&ordenarPor=id`,
    );
    const references = yield* Schema.decodeUnknownEffect(
      Schema.Array(Reference),
    )(recent.dados);
    const voteList = yield* client.get(
      `${API}/votacoes?dataInicio=${today.slice(0, 7)}-01&dataFim=${today}&itens=8&ordem=DESC&ordenarPor=dataHoraRegistro`,
    );
    const voteRefs = yield* Schema.decodeUnknownEffect(
      Schema.Array(VoteReference),
    )(voteList.dados);
    const recentVotes = yield* Effect.forEach(
      voteRefs,
      Effect.fnUntraced(function* (vote) {
        const response = yield* client.get(`${API}/votacoes/${vote.id}`);
        const detail = yield* Schema.decodeUnknownEffect(VotingDetail)(
          response.dados,
        );
        if (detail.id !== vote.id)
          return yield* new PipelineError({
            stage: "validation",
            message: "Identificador de votação incompatível com a requisição",
          });
        return { raw: response.dados, detail };
      }),
      { concurrency: 1 },
    );
    const ids = [
      ...new Set([
        ...previous.propositions.map((p) => p.id),
        ...requestedIds,
        ...references.map((p) => p.id),
        ...recentVotes.flatMap((vote) =>
          (vote.detail.proposicoesAfetadas ?? []).map((p) => p.id),
        ),
      ]),
    ];
    const votingDetails = new Map(
      recentVotes.map(({ detail }) => [detail.id, detail]),
    );
    const propositions = yield* Effect.forEach(
      ids,
      Effect.fnUntraced(function* (id) {
        yield* Schema.decodeUnknownEffect(Id)(id);
        const response = yield* client.get(`${API}/proposicoes/${id}`);
        const p = yield* Schema.decodeUnknownEffect(Proposal)(response.dados);
        if (p.id !== id)
          return yield* new PipelineError({
            stage: "collection",
            message: "ID retornado pela Câmara não corresponde ao solicitado",
          });
        const authors = yield* client
          .all(`${API}/proposicoes/${id}/autores`)
          .pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Author))),
          );
        const votes = yield* client
          .all(`${API}/proposicoes/${id}/votacoes`)
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Vote))));
        for (const vote of votes) {
          if (!votingDetails.has(vote.id)) {
            const response = yield* client.get(`${API}/votacoes/${vote.id}`);
            const detail = yield* Schema.decodeUnknownEffect(VotingDetail)(
              response.dados,
            );
            if (detail.id !== vote.id)
              return yield* new PipelineError({
                stage: "validation",
                message:
                  "Identificador de votação incompatível com a requisição",
              });
            votingDetails.set(vote.id, detail);
          }
        }
        const labels = yield* collectLabels(id);
        const summary = yield* Effect.try({
          try: () => attachSummary(p, summaries),
          catch: () =>
            new PipelineError({
              stage: "validation",
              message: "Resumo existente inválido",
            }),
        });
        return {
          id: p.id,
          label: `${p.siglaTipo} ${p.numero}/${p.ano}`,
          type: p.descricaoTipo,
          ementa: p.ementa,
          presentedAt: p.dataApresentacao,
          status: p.statusProposicao,
          authors: authors.map((a) => ({ name: a.nome, type: a.tipo })),
          labels,
          url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}`,
          apiUrl: officialUrl(p.uri),
          documentUrl: officialUrl(p.urlInteiroTeor),
          votes: votes.map((v) => ({
            id: v.id,
            date: v.data,
            description: v.descricao,
            organ: v.siglaOrgao,
            url: officialUrl(v.uri),
          })),
          sourceHash: sourceHash(p),
          summary,
        };
      }),
      { concurrency: 1 },
    );
    const snapshot = {
      collectedAt,
      coverage: "Câmara dos Deputados · amostra de proposições e votações",
      propositions: propositions.toSorted((a, b) =>
        b.presentedAt.localeCompare(a.presentedAt),
      ),
    };
    yield* Schema.decodeUnknownEffect(Snapshot)(snapshot);
    const votings = yield* Effect.forEach(
      [...votingDetails.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
      collectBallots,
      { concurrency: 1 },
    );
    const legislative: LegislativeDataset = {
      schemaVersion: 1,
      collectedAt,
      coverage: snapshot.coverage,
      propositions: propositions.map((p) => ({
        id: p.id,
        label: p.label,
        ementa: p.ementa,
        url: p.url,
        labels: p.labels,
        votingIds: p.votes.map((vote) => vote.id),
      })),
      votings: votings.map((voting) => ({
        ...voting,
        propositionIds: [
          ...new Set([
            ...voting.propositionIds.filter((id) => ids.includes(id)),
            ...propositions
              .filter((p) => p.votes.some((vote) => vote.id === voting.id))
              .map((p) => p.id),
          ]),
        ].toSorted((a, b) => a - b),
      })),
    };
    const pending = propositions
      .filter((p) => !p.summary)
      .map((p) => ({
        id: p.id,
        sourceHash: p.sourceHash,
        ementa: p.ementa,
        source: p.apiUrl,
      }));
    return {
      snapshot,
      legislative,
      pending,
      recentVotes: recentVotes.map((vote) => vote.raw),
      raw: (yield* client.raw).map(redactBallotContacts),
    };
  },
  Effect.catchTag("SchemaError", () =>
    Effect.fail(
      new PipelineError({
        stage: "validation",
        message: "Dados oficiais incompatíveis com o contrato esperado",
      }),
    ),
  ),
);
