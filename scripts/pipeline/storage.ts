import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { hash, encode } from "./content.ts";
import { PipelineError } from "./errors.ts";

type Store = {
  readonly kind: "memory" | "s3";
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

const S3Config = Schema.Struct({
  S3_BUCKET: Schema.String.check(
    Schema.isPattern(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  ),
  S3_ENDPOINT: Schema.optionalKey(Schema.String),
  S3_REGION: Schema.optionalKey(Schema.String),
  S3_FORCE_PATH_STYLE: Schema.optionalKey(
    Schema.Literals(["true", "false", ""]),
  ),
  AWS_ACCESS_KEY_ID: Schema.optionalKey(Schema.String),
  AWS_SECRET_ACCESS_KEY: Schema.optionalKey(Schema.String),
  AWS_SESSION_TOKEN: Schema.optionalKey(Schema.String),
});
const Endpoint = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      ? true
      : "S3_ENDPOINT deve usar HTTPS sem credenciais (HTTP apenas em loopback)",
  ),
);

// Acquisition is lazy and scoped. No bucket creation, ACL changes or network
// requests occur here; the SDK is closed on success, failure or interruption.
export const createS3Store = Effect.fn("createS3Store")(function* (
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = yield* Schema.decodeUnknownEffect(S3Config)(env).pipe(
    Effect.mapError(
      () =>
        new PipelineError({
          stage: "storage",
          message: "Configuração S3 inválida; confira .env.example",
        }),
    ),
  );
  const endpoint = config.S3_ENDPOINT
    ? yield* Schema.decodeUnknownEffect(Endpoint)(config.S3_ENDPOINT).pipe(
        Effect.mapError(
          () =>
            new PipelineError({
              stage: "storage",
              message:
                "S3_ENDPOINT deve usar HTTPS sem credenciais (HTTP apenas em loopback)",
            }),
        ),
      )
    : undefined;
  if (
    Boolean(config.AWS_ACCESS_KEY_ID) !== Boolean(config.AWS_SECRET_ACCESS_KEY)
  )
    return yield* new PipelineError({
      stage: "storage",
      message: "Forneça ambas as credenciais S3 ou use identidade de workload",
    });
  const client = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new S3Client({
          region: config.S3_REGION || "us-east-1",
          endpoint: endpoint?.href,
          forcePathStyle: config.S3_FORCE_PATH_STYLE === "true",
          maxAttempts: 3,
          credentials: config.AWS_ACCESS_KEY_ID
            ? {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
                ...(config.AWS_SESSION_TOKEN
                  ? { sessionToken: config.AWS_SESSION_TOKEN }
                  : {}),
              }
            : undefined,
        }),
    ),
    (client) => Effect.sync(() => client.destroy()),
  );
  const put = Effect.fn("ObjectStore.put")(function* (
    key: string,
    body: string,
  ) {
    yield* Effect.tryPromise({
      try: (signal) =>
        client.send(
          new PutObjectCommand({
            Bucket: config.S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: "application/json; charset=utf-8",
            IfNoneMatch: "*",
          }),
          { abortSignal: signal },
        ),
      catch: (error) =>
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 412
          ? null
          : new PipelineError({
              stage: "storage",
              message: "Falha na gravação S3; detalhes privados omitidos",
            }),
    }).pipe(
      Effect.catch((error) =>
        error === null ? Effect.void : Effect.fail(error),
      ),
    );
  });
  const get = Effect.fn("ObjectStore.get")(function* (key: string) {
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
          { abortSignal: signal },
        );
        return await result.Body!.transformToString();
      },
      catch: (error) =>
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
          ? null
          : new PipelineError({
              stage: "storage",
              message: "Falha na leitura S3; detalhes privados omitidos",
            }),
    }).pipe(
      Effect.catch((error) =>
        error === null ? Effect.succeed(null) : Effect.fail(error),
      ),
    );
  });
  return ObjectStore.of({ kind: "s3", put, get });
});

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
