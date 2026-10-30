import { Effect, Schema } from "effect";
import { Camara, OfficialUrlString, type RawResponse } from "./camara.ts";
import { PipelineError } from "./errors.ts";

const Id = Schema.Int.check(Schema.isGreaterThan(0));
export const ThemeLabel = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  sourceUrl: OfficialUrlString,
  relevance: Schema.Int,
});
const OfficialTheme = Schema.Struct({
  codTema: Id,
  tema: Schema.NonEmptyString,
  relevancia: Schema.Int,
});
export const VotingDetail = Schema.Struct({
  id: Schema.NonEmptyString,
  uri: OfficialUrlString,
  data: Schema.NonEmptyString,
  descricao: Schema.NonEmptyString,
  siglaOrgao: Schema.NonEmptyString,
  aprovacao: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  proposicoesAfetadas: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Id })),
  ),
}).check(
  Schema.makeFilter((voting) =>
    voting.uri ===
    `https://dadosabertos.camara.leg.br/api/v2/votacoes/${voting.id}`
      ? true
      : "Fonte incompatível com o identificador da votação",
  ),
);
const RecordedVote = Schema.Struct({
  tipoVoto: Schema.NonEmptyString,
  dataRegistroVoto: Schema.optionalKey(Schema.NullOr(Schema.String)),
  deputado_: Schema.Struct({
    id: Id,
    nome: Schema.NonEmptyString,
    siglaPartido: Schema.NullOr(Schema.String),
    siglaUf: Schema.NullOr(Schema.String),
    idLegislatura: Schema.optionalKey(Schema.NullOr(Id)),
  }),
});

export const collectLabels = Effect.fn("collectLabels")(function* (id: number) {
  const client = yield* Camara;
  const sourceUrl = `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${id}/temas`;
  const themes = yield* client
    .all(sourceUrl)
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(OfficialTheme))),
    );
  return [
    ...new Map(
      themes.map((theme) => [
        theme.codTema,
        {
          id: `camara:tema:${theme.codTema}`,
          name: theme.tema,
          sourceUrl,
          relevance: theme.relevancia,
        },
      ]),
    ).values(),
  ].toSorted((a, b) => a.id.localeCompare(b.id));
});

export const collectBallots = Effect.fn("collectBallots")(function* (
  detail: typeof VotingDetail.Type,
) {
  const client = yield* Camara;
  const ballotsUrl = `${detail.uri}/votos`;
  const records = yield* client
    .all(ballotsUrl)
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(RecordedVote))),
    );
  if (
    new Set(records.map((record) => record.deputado_.id)).size !==
    records.length
  )
    return yield* new PipelineError({
      stage: "validation",
      message: "Registros de voto duplicados para deputado na mesma votação",
    });
  return {
    id: detail.id,
    date: detail.data,
    description: detail.descricao,
    organ: detail.siglaOrgao,
    url: detail.uri,
    ballotsUrl,
    approval: detail.aprovacao ?? null,
    propositionIds: (detail.proposicoesAfetadas ?? []).map((p) => p.id),
    ballotCoverage: records.length
      ? ("recorded-votes" as const)
      : ("no-individual-records" as const),
    ballots: records
      .map((record) => ({
        deputyId: record.deputado_.id,
        name: record.deputado_.nome,
        party: record.deputado_.siglaPartido,
        state: record.deputado_.siglaUf,
        legislature: record.deputado_.idLegislatura ?? null,
        vote: record.tipoVoto,
        registeredAt: record.dataRegistroVoto ?? null,
      }))
      .toSorted((a, b) => a.deputyId - b.deputyId),
  };
});

export const LegislativeData = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  collectedAt: Schema.NonEmptyString,
  coverage: Schema.NonEmptyString,
  propositions: Schema.Array(
    Schema.Struct({
      id: Id,
      label: Schema.NonEmptyString,
      ementa: Schema.NonEmptyString,
      url: OfficialUrlString,
      labels: Schema.Array(ThemeLabel),
      votingIds: Schema.Array(Schema.NonEmptyString),
    }),
  ),
  votings: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      date: Schema.NonEmptyString,
      description: Schema.NonEmptyString,
      organ: Schema.NonEmptyString,
      url: OfficialUrlString,
      ballotsUrl: OfficialUrlString,
      approval: Schema.NullOr(Schema.Int),
      propositionIds: Schema.Array(Id),
      ballotCoverage: Schema.Literals([
        "recorded-votes",
        "no-individual-records",
      ]),
      ballots: Schema.Array(
        Schema.Struct({
          deputyId: Id,
          name: Schema.NonEmptyString,
          party: Schema.NullOr(Schema.String),
          state: Schema.NullOr(Schema.String),
          legislature: Schema.NullOr(Id),
          vote: Schema.NonEmptyString,
          registeredAt: Schema.NullOr(Schema.String),
        }),
      ),
    }),
  ),
});

// The public source capture retains legislative fields, not contact details or photos.
// The omission is recorded alongside the response instead of pretending it is byte-exact raw HTTP.
export function redactBallotContacts(response: RawResponse): RawResponse {
  if (!new URL(response.url).pathname.endsWith("/votos")) return response;
  const body = Schema.decodeUnknownSync(
    Schema.Struct({
      dados: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
      links: Schema.optionalKey(Schema.Unknown),
    }),
  )(response.body);
  return {
    ...response,
    redactions: ["dados[].deputado_.email", "dados[].deputado_.urlFoto"],
    body: {
      ...body,
      dados: body.dados.map((row) => {
        const deputy = Schema.decodeUnknownSync(
          Schema.Record(Schema.String, Schema.Unknown),
        )(row.deputado_);
        const { email: _email, urlFoto: _photo, ...legislative } = deputy;
        return { ...row, deputado_: legislative };
      }),
    },
  };
}
