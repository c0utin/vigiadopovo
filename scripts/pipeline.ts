import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Option, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { collect } from "./pipeline/collect.ts";
import { makeCamaraLayer, type RawResponse } from "./pipeline/camara.ts";
import {
  buildContext,
  createBrief,
  buildInferenceRequest,
  generateDraft,
  CHANNELS,
  Snapshot,
  type Channel,
  type Infer,
} from "./pipeline/content.ts";
import { inferenceFromEnv } from "./pipeline/inference.ts";
import {
  archiveRun,
  ObjectStore,
  createMemoryStore,
  type Artifact,
} from "./pipeline/storage.ts";
import { PipelineError } from "./pipeline/errors.ts";
import type { LegislativeDataset } from "../src/lib/legislative.ts";
import { LegislativeData } from "./pipeline/legislative.ts";

export const runPipeline = Effect.fn("runPipeline")(function* ({
  snapshot,
  legislative,
  raw = [],
  ids,
  channels = CHANNELS,
  infer,
}: {
  snapshot: unknown;
  legislative?: LegislativeDataset;
  raw?: readonly RawResponse[];
  ids?: readonly number[];
  channels?: readonly Channel[];
  infer?: Infer;
}) {
  if (infer && (!ids || ids.length !== 1 || channels.length !== 1))
    return yield* new PipelineError({
      stage: "validation",
      message:
        "Geração exige uma proposição e um canal explícitos para limitar custo e contexto",
    });
  const context = yield* Effect.try({
    try: () => buildContext(snapshot, { ids }),
    catch: () =>
      new PipelineError({
        stage: "validation",
        message: "Snapshot ou seleção de contexto inválidos",
      }),
  });
  const editorial = yield* Effect.forEach(
    channels,
    Effect.fnUntraced(function* (channel) {
      const brief = createBrief(context, channel);
      const request = yield* Effect.try({
        try: () => buildInferenceRequest(context, brief),
        catch: () =>
          new PipelineError({
            stage: "validation",
            message:
              "Contexto excede o orçamento ou briefing incompatível; selecione menos propostas",
          }),
      });
      const artifacts: Artifact[] = [
        { kind: "brief", value: brief },
        { kind: "request", value: request },
      ];
      return infer
        ? [
            ...artifacts,
            {
              kind: "draft" as const,
              value: yield* generateDraft({ context, brief, infer }),
            },
          ]
        : artifacts;
    }),
    { concurrency: 1 },
  );
  return yield* archiveRun({
    artifacts: [
      ...raw.map((value) => ({ kind: "raw" as const, value })),
      { kind: "normalized", value: snapshot },
      ...(legislative
        ? [{ kind: "legislative" as const, value: legislative }]
        : []),
      { kind: "context", value: context },
      ...editorial.flat(),
    ],
  });
});

const flags = {
  live: Flag.Boolean("live").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Coletar novamente na API oficial; não altera o portal",
    ),
  ),
  id: Flag.Int("id").pipe(
    Flag.withSchema(Schema.Int.check(Schema.isGreaterThan(0))),
    Flag.optional,
  ),
  channel: Flag.Literals("channel", CHANNELS).pipe(Flag.optional),
  out: Flag.String("out").pipe(
    Flag.withSchema(Schema.NonEmptyString),
    Flag.optional,
    Flag.withDescription("Exportação local opcional dentro de .pipeline/"),
  ),
};
type Options = {
  live: boolean;
  id: Option.Option<number>;
  channel: Option.Option<Channel>;
  out: Option.Option<string>;
};

const handle = Effect.fn("handle")(function* (
  mode: "prepare" | "generate",
  options: Options,
) {
  const id = Option.getOrUndefined(options.id);
  const channel = Option.getOrUndefined(options.channel);
  const out = Option.getOrUndefined(options.out);
  if (mode === "generate" && (!id || !channel || !out))
    return yield* new PipelineError({
      stage: "cli",
      message:
        "Use generate --id ID --channel CANAL --out PASTA; uma inferência pode ter custo",
    });
  const directory = out ? resolve(".pipeline", out) : undefined;
  if (directory && !directory.startsWith(`${resolve(".pipeline")}/`))
    return yield* new PipelineError({
      stage: "cli",
      message: "--out deve ser um subdiretório de .pipeline/",
    });
  const fs = yield* FileSystem.FileSystem;
  const previous = yield* fs
    .readFileString("src/lib/data/portal.json")
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown)),
      ),
    );
  const collection = options.live
    ? yield* collect({
        previous: yield* Schema.decodeUnknownEffect(Snapshot)(previous),
        ids: id ? [id] : [],
      })
    : {
        snapshot: previous,
        raw: [],
        legislative: yield* fs
          .readFileString("data/legislative.json")
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.fromJsonString(LegislativeData),
              ),
            ),
          ),
      };
  const infer = mode === "generate" ? yield* inferenceFromEnv : undefined;
  const memory = createMemoryStore();
  const result = yield* runPipeline({
    ...collection,
    ids: id ? [id] : undefined,
    channels: channel ? [channel] : CHANNELS,
    infer,
  }).pipe(Effect.provideService(ObjectStore, memory));
  if (directory) {
    for (const [key, body] of memory.objects) {
      const path = resolve(directory, key);
      yield* fs.makeDirectory(dirname(path), { recursive: true });
      yield* fs.writeFileString(path, body);
    }
    yield* Console.log(`Exportação local: .pipeline/${out}`);
  }
  yield* Console.log(
    `${result.manifest.artifacts.length} artefatos; ${mode === "generate" ? "1 rascunho sem revisão humana" : "nenhuma chamada de IA"}. Armazenamento: memória; nenhum upload S3.`,
  );
  yield* Console.log(`Manifesto: ${result.key}`);
});

const prepare = Command.make("prepare", flags, (options) =>
  handle("prepare", options),
).pipe(
  Command.withDescription("Preparar contexto reutilizável sem IA nem uploads"),
);
const generate = Command.make("generate", flags, (options) =>
  handle("generate", options),
).pipe(
  Command.withDescription(
    "Gerar um rascunho para revisão usando a IA configurada",
  ),
);
const cli = Command.make("pipeline").pipe(
  Command.withSubcommands([prepare, generate]),
  Command.run({ version: "1.0.0" }),
);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  cli
    .pipe(
      Effect.provide(makeCamaraLayer()),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
      Effect.provide(NodeServices.layer),
      Effect.catchTags({
        PipelineError: (error) =>
          Console.error(`${error.stage}: ${error.message}`).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              }),
            ),
          ),
        SourceError: (error) =>
          Console.error(error.message).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              }),
            ),
          ),
        SchemaError: () =>
          Console.error(
            "Artefato de entrada inválido; detalhes privados omitidos",
          ).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              }),
            ),
          ),
      }),
    )
    .pipe(NodeRuntime.runMain({ disableErrorReporting: true }));
}
