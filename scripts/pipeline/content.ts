import { createHash } from "node:crypto";
import { Schema } from "effect";
import { OfficialUrlString } from "./camara.ts";
import { ThemeLabel } from "./legislative.ts";

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
export const encode = (value: unknown) =>
  JSON.stringify(canonical(value), null, 2) + "\n";
export const hash = (value: unknown) =>
  createHash("sha256").update(encode(value)).digest("hex");
const text = Schema.NonEmptyString;
const url = OfficialUrlString;
export const Snapshot = Schema.Struct({
  collectedAt: text,
  coverage: text,
  propositions: Schema.Array(
    Schema.Struct({
      id: Schema.Int.check(Schema.isGreaterThan(0)),
      label: text,
      type: text,
      ementa: text,
      presentedAt: text,
      url,
      apiUrl: url,
      documentUrl: Schema.NullOr(url),
      authors: Schema.Array(Schema.Struct({ name: text, type: text })),
      labels: Schema.optionalKey(Schema.Array(ThemeLabel)),
      status: Schema.NullOr(
        Schema.Struct({
          dataHora: Schema.optionalKey(Schema.NullOr(Schema.String)),
          descricaoSituacao: Schema.optionalKey(Schema.NullOr(Schema.String)),
          descricaoTramitacao: Schema.optionalKey(Schema.NullOr(Schema.String)),
          siglaOrgao: Schema.optionalKey(Schema.NullOr(Schema.String)),
          despacho: Schema.optionalKey(Schema.NullOr(Schema.String)),
        }),
      ),
      votes: Schema.Array(
        Schema.Struct({
          id: text,
          date: text,
          description: text,
          organ: text,
          url,
        }),
      ),
    }),
  ),
});
