import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Effect } from "effect";
import { collect } from "./pipeline/collect.ts";
import { makeCamaraLayer } from "./pipeline/camara.ts";
import { runPipeline } from "./pipeline.ts";
import { ObjectStore, createMemoryStore } from "./pipeline/storage.ts";
export { officialUrl } from "./pipeline/camara.ts";
export { sourceHash, attachSummary, collect } from "./pipeline/collect.ts";

// Promise boundary retained for existing callers; collection itself is Effect.
export async function sync({ ids = [] } = {}) {
  const previous = await readFile("src/lib/data/portal.json", "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return { propositions: [] };
      throw error;
    });
  const summaries = JSON.parse(await readFile("data/summaries.json", "utf8"));
  const collection = await Effect.runPromise(
    collect({ previous, summaries, ids }).pipe(
      Effect.provide(makeCamaraLayer()),
    ),
  );
  const { snapshot: output, pending, recentVotes, legislative } = collection;
  const memory = createMemoryStore();
  const run = await Effect.runPromise(
    runPipeline({ ...collection, channels: [] }).pipe(
      Effect.provideService(ObjectStore, memory),
    ),
  );
  // Immutable public artifacts are written before pointers to the new collection.
  for (const [key, body] of memory.objects) {
    const path = `static/pipeline/${key}`;
    await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await writeFile(`${path}.tmp`, body);
    await rename(`${path}.tmp`, path);
  }
  const { collectedAt, propositions } = output;
  const provenance = {
    schemaVersion: 1,
    collectedAt,
    coverage: output.coverage,
    manifestUrl: `/pipeline/${run.key}`,
    manifestHash: run.key.split("/").at(-1).replace(".json", ""),
    artifacts: run.manifest.artifacts.map((entry) => {
      const capture =
        entry.kind === "raw" ? JSON.parse(memory.objects.get(entry.key)) : null;
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
    inferenceInThisRun: false,
    humanReview: "not-performed",
    remoteStorage: "disabled",
  };
  await mkdir("src/lib/data", { recursive: true });
  await mkdir("static", { recursive: true });
  // Publish only after collection/validation succeeds. Renames are atomic per
  // file, not a transaction across files; this legacy publisher is single-writer.
  for (const [path, value] of [
    ["src/lib/data/portal.json", output],
    ["static/dados.json", output],
    ["data/pending.json", pending],
    ["data/recent-votes.json", { collectedAt, votes: recentVotes }],
    ["data/legislative.json", legislative],
    ["static/legislativo.json", legislative],
    ["src/lib/data/provenance.json", provenance],
  ]) {
    await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
    await rename(`${path}.tmp`, path);
  }
  console.log(
    `${propositions.length} proposições coletadas; ${propositions.filter((p) => p.summary).length} resumos válidos; ${pending.length} aguardando resumo.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ids = process.argv.slice(2).map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    console.error(
      "Use pnpm data:sync [ID_PROPOSICAO ...] com IDs inteiros positivos",
    );
    process.exitCode = 1;
  } else
    sync({ ids }).catch(() => {
      console.error(
        "Falha na coleta/publicação local; a etapa de coleta deve terminar antes da publicação.",
      );
      process.exitCode = 1;
    });
}
