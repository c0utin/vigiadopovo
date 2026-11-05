import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { hash, encode } from "./content.ts";
import { PipelineError } from "./errors.ts";

type Store = {
  readonly kind: "memory";
  put(key: string, body: string): Effect.Effect<void, PipelineError>;
  get(key: string): Effect.Effect<string | null, PipelineError>;
};
export class ObjectStore extends Context.Service<ObjectStore, Store>()(
  "vigia/pipeline/ObjectStore",
) {
  static readonly memory = Layer.sync(ObjectStore, createMemoryStore);
}

export function createMemoryStore() {
  const objects = new Map<string, string>();
  return {
    kind: "memory" as const,
    objects,
    put: (key: string, body: string) =>
      Effect.sync(() => {
        objects.set(key, body);
      }),
    get: (key: string) => Effect.sync(() => objects.get(key) ?? null),
  };
}

const Kind = Schema.Literals([
  "raw",
  "normalized",
  "legislative",
  "context",
  "brief",
  "draft",
  "request",
]);
export type Artifact = { kind: typeof Kind.Type; value: unknown };
const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  createdAt: Schema.String,
  artifacts: Schema.Array(
    Schema.Struct({
      kind: Kind,
      key: Schema.String,
      sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
      bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
});

export const archiveRun = Effect.fn("archiveRun")(
  function* ({
    artifacts,
    createdAt,
  }: {
    artifacts: readonly Artifact[];
    createdAt?: string;
  }) {
    const store = yield* ObjectStore;
    const timestamp = createdAt ?? DateTime.formatIso(yield* DateTime.now);
    const entries = yield* Effect.forEach(
      artifacts,
      Effect.fnUntraced(function* ({ kind, value }) {
        yield* Schema.decodeUnknownEffect(Kind)(kind);
        const digest = hash(value);
        const key = `v1/${kind}/${digest}.json`;
        const body = encode(value);
        yield* store.put(key, body);
        return { kind, key, sha256: digest, bytes: Buffer.byteLength(body) };
      }),
      { concurrency: 1 },
    );
    const manifest = {
      schemaVersion: 1 as const,
      createdAt: timestamp,
      artifacts: entries,
    };
    const key = `v1/manifests/${hash(manifest)}.json`;
    yield* store.put(key, encode(manifest));
    return { key, manifest };
  },
  Effect.catchTag("SchemaError", () =>
    Effect.fail(
      new PipelineError({
        stage: "validation",
        message: "Tipo de artefato inválido",
      }),
    ),
  ),
);

export const loadRun = Effect.fn("loadRun")(
  function* (key: string) {
    const store = yield* ObjectStore;
    const body = yield* store.get(key);
    if (body === null)
      return yield* new PipelineError({
        stage: "storage",
        message: "Manifesto não encontrado",
      });
    const manifest = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Manifest),
    )(body);
    if (key !== `v1/manifests/${hash(manifest)}.json`)
      return yield* new PipelineError({
        stage: "storage",
        message: "Manifesto corrompido",
      });
    const artifacts = yield* Effect.forEach(
      manifest.artifacts,
      Effect.fnUntraced(function* (entry) {
        if (entry.key !== `v1/${entry.kind}/${entry.sha256}.json`)
          return yield* new PipelineError({
            stage: "storage",
            message: "Referência de artefato inválida",
          });
        const body = yield* store.get(entry.key);
        if (body === null || Buffer.byteLength(body) !== entry.bytes)
          return yield* new PipelineError({
            stage: "storage",
            message: "Artefato ausente ou corrompido",
          });
        const value = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(body);
        if (hash(value) !== entry.sha256)
          return yield* new PipelineError({
            stage: "storage",
            message: "Artefato corrompido",
          });
        return { kind: entry.kind, value };
      }),
      { concurrency: 1 },
    );
    return { manifest, artifacts };
  },
  Effect.catchTag("SchemaError", () =>
    Effect.fail(
      new PipelineError({
        stage: "validation",
        message: "Artefato inválido ou corrompido",
      }),
    ),
  ),
);
