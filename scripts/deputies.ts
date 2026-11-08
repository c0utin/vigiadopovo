import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";
import { pathToFileURL } from "node:url";
import { Camara, makeCamaraLayer } from "./pipeline/camara.ts";
import { collectDeputies, collectMandates } from "./pipeline/deputies.ts";
import { PipelineError } from "./pipeline/errors.ts";
import { writeAtomic } from "./pipeline/files.ts";

const PHOTOS = "static/fotos/deputados";

// Requires Camara (makeCamaraLayer), FileSystem and Path. Writes only after the
// whole collection succeeds, so a failed run keeps the previous files.
export const syncDeputies = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(PHOTOS, { recursive: true });
  const photos = new Set(yield* fs.readDirectory(PHOTOS));
  const dataset = yield* collectDeputies();
  const mandates = yield* collectMandates();
  if (!mandates.legislatures.some((l) => l.id === dataset.legislature))
    return yield* new PipelineError({
      stage: "validation",
      message: "Legislatura atual ausente da lista de legislaturas",
    });
  const client = yield* Camara;
  // Official photos rarely change: fetch only deputies without one. A
  // missing photo is shown as such; it never blocks the data.
  const missing: number[] = [];
  yield* Effect.forEach(
    dataset.deputies,
    (deputy) => {
      const name = `${deputy.id}.jpg`;
      if (photos.has(name)) return Effect.void;
      return client.photo(deputy.id).pipe(
        Effect.flatMap((body) => writeAtomic(path.join(PHOTOS, name), body)),
        Effect.tap(() => Effect.sync(() => photos.add(name))),
        Effect.catchTag("SourceError", () =>
          Effect.sync(() => missing.push(deputy.id)),
        ),
      );
    },
    { concurrency: 4, discard: true },
  );
  for (const deputy of dataset.deputies) {
    const name = `${deputy.id}.jpg`;
    deputy.photo = photos.has(name) ? `/fotos/deputados/${name}` : null;
  }
  // Photos of deputies no longer in office are not republished.
  const current = new Set(dataset.deputies.map((d) => `${d.id}.jpg`));
  for (const name of photos)
    if (!current.has(name)) yield* fs.remove(path.join(PHOTOS, name));
  // Minified: with every bill of the legislature it is about 15 MB, and
  // Cloudflare serves static assets of up to 25 MiB.
  yield* writeAtomic("static/deputados.json", JSON.stringify(dataset) + "\n");
  yield* writeAtomic(
    "static/deputados-mandatos.json",
    JSON.stringify(mandates) + "\n",
  );
  yield* Console.log(
    `${dataset.deputies.length} deputados coletados; ${missing.length} sem foto oficial disponível; ${mandates.deputies.length} deputados em ${mandates.legislatures.length} legislaturas.`,
  );
  return dataset;
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  syncDeputies.pipe(
    // About 1,030 requests: the Câmara gateway answers 504 for a minute or
    // more at a time, and eight retries (~2 min of backoff) ride it out.
    Effect.provide(makeCamaraLayer({ retries: 8 })),
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
