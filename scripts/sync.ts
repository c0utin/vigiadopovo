import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, FileSystem, Path, Schema } from "effect";
import { pathToFileURL } from "node:url";
import { collect } from "./pipeline/collect.ts";
import { makeCamaraLayer } from "./pipeline/camara.ts";
import { writeAtomic } from "./pipeline/files.ts";
import { archiveRun } from "./pipeline/storage.ts";

const PreviousSnapshot = Schema.fromJsonString(
  Schema.Struct({
    propositions: Schema.Array(Schema.Struct({ id: Schema.Int })),
  }),
);
const Summaries = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);

// Only GitHub Actions runs carry attestations; local runs record null.
const collector = Effect.gen(function* () {
  const actions = yield* Config.withDefault(
    Config.String("GITHUB_ACTIONS"),
    "",
  );
  if (actions !== "true") return null;
  const { repository, commit, server, run } = yield* Config.all({
    repository: Config.String("GITHUB_REPOSITORY"),
    commit: Config.String("GITHUB_SHA"),
    server: Config.String("GITHUB_SERVER_URL"),
    run: Config.String("GITHUB_RUN_ID"),
  });
  return {
    repository,
    commit,
    workflowRun: `${server}/${repository}/actions/runs/${run}`,
  };
});

export const sync = Effect.fn("sync")(function* ({
  ids = [],
}: { readonly ids?: readonly number[] } = {}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const previous = (yield* fs.exists("static/dados.json"))
    ? yield* fs
        .readFileString("static/dados.json")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(PreviousSnapshot)))
    : { propositions: [] };
  const summaries = yield* fs
    .readFileString("data/summaries.json")
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Summaries)));
  const {
    snapshot: output,
    pending,
    legislative,
    raw,
  } = yield* collect({ previous, summaries, ids }).pipe(
    Effect.provide(makeCamaraLayer()),
  );
  const { key, manifest, objects } = yield* archiveRun([
    ...raw.map((value) => ({ kind: "raw" as const, value })),
    { kind: "normalized", value: output },
    { kind: "legislative", value: legislative },
  ]);
  // Immutable public artifacts are written before pointers to the new collection.
  for (const [objectKey, body] of objects)
    yield* writeAtomic(path.join("static/pipeline", objectKey), body);
  const { collectedAt, propositions } = output;
  const provenance = {
    schemaVersion: 1,
    collectedAt,
    coverage: output.coverage,
    manifestUrl: `/pipeline/${key}`,
    manifestHash: key.split("/").at(-1)!.replace(".json", ""),
    // Raw captures come first in the manifest, in the order of `raw`.
    artifacts: manifest.artifacts.map((entry, index) => {
      const capture = entry.kind === "raw" ? raw[index] : null;
      return {
        ...entry,
        url: `/pipeline/${entry.key}`,
        sourceUrl: capture?.url ?? null,
        capturedAt: capture?.collectedAt ?? null,
        redactions: capture?.redactions ?? [],
      };
    }),
    counts: {
      propositions: propositions.length,
      votings: legislative.votings.length,
      ballots: legislative.votings.reduce(
        (total, voting) => total + voting.ballots.length,
        0,
      ),
      labels: new Set(
        propositions.flatMap((p) => p.labels.map((label) => label.id)),
      ).size,
      summaries: propositions.filter((p) => p.summary).length,
    },
    collector: yield* collector,
  };
  // Publish only after collection/validation succeeds. Renames are atomic per
  // file, not across files; the collection workflow is the only writer.
  for (const [file, value] of [
    ["static/dados.json", output],
    ["data/pending.json", pending],
    ["static/legislativo.json", legislative],
    ["src/lib/data/provenance.json", provenance],
  ] as const)
    yield* writeAtomic(file, JSON.stringify(value, null, 2) + "\n");
  yield* Console.log(
    `${propositions.length} proposições coletadas; ${propositions.filter((p) => p.summary).length} resumos válidos; ${pending.length} aguardando resumo.`,
  );
});

const fail = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

const cli = Effect.gen(function* () {
  const ids = process.argv.slice(2).map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
    return yield* fail(
      "Use pnpm data:sync [ID_PROPOSICAO ...] com IDs inteiros positivos",
    );
  yield* sync({ ids }).pipe(
    Effect.matchEffect({
      onFailure: () =>
        fail(
          "Falha na coleta/publicação local; a etapa de coleta deve terminar antes da publicação.",
        ),
      onSuccess: () => Effect.void,
    }),
  );
});

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  cli.pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain({ disableErrorReporting: true }),
  );
}
