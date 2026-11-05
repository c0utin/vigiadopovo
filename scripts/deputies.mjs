import { mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Effect } from "effect";
import { Camara, makeCamaraLayer } from "./pipeline/camara.ts";
import { collectDeputies, collectMandates } from "./pipeline/deputies.ts";

const PHOTOS = "static/fotos/deputados";

async function replace(path, body) {
  await writeFile(`${path}.tmp`, body);
  await rename(`${path}.tmp`, path);
}

// Promise boundary like sync.mjs; collection itself is Effect.
export async function syncDeputies({ layer = makeCamaraLayer() } = {}) {
  await mkdir(PHOTOS, { recursive: true });
  const { dataset, mandates, missing } = await Effect.runPromise(
    Effect.gen(function* () {
      const dataset = yield* collectDeputies();
      const mandates = yield* collectMandates();
      if (!mandates.legislatures.some((l) => l.id === dataset.legislature))
        throw new Error("Legislatura atual ausente da lista de legislaturas");
      const client = yield* Camara;
      // Official photos rarely change: fetch only deputies without one. A
      // missing photo is shown as such; it never blocks the data.
      const missing = [];
      yield* Effect.forEach(
        dataset.deputies,
        (deputy) => {
          const path = `${PHOTOS}/${deputy.id}.jpg`;
          if (existsSync(path)) return Effect.void;
          return client.photo(deputy.id).pipe(
            Effect.flatMap((body) => Effect.promise(() => replace(path, body))),
            Effect.catchTag("SourceError", () =>
              Effect.sync(() => missing.push(deputy.id)),
            ),
          );
        },
        { concurrency: 4, discard: true },
      );
      return { dataset, mandates, missing };
    }).pipe(Effect.provide(layer)),
  );
  for (const deputy of dataset.deputies)
    if (existsSync(`${PHOTOS}/${deputy.id}.jpg`))
      deputy.photo = `/fotos/deputados/${deputy.id}.jpg`;
  // Photos of deputies no longer in office are not republished.
  const current = new Set(dataset.deputies.map((d) => `${d.id}.jpg`));
  for (const name of await readdir(PHOTOS))
    if (!current.has(name)) await unlink(`${PHOTOS}/${name}`);
  const body = JSON.stringify(dataset, null, 2) + "\n";
  await mkdir("src/lib/data", { recursive: true });
  await replace("src/lib/data/deputies.json", body);
  await replace("static/deputados.json", body);
  const history = JSON.stringify(mandates) + "\n";
  await replace("src/lib/data/deputies-mandates.json", history);
  await replace("static/deputados-mandatos.json", history);
  console.log(
    `${dataset.deputies.length} deputados coletados; ${missing.length} sem foto oficial disponível; ${mandates.deputies.length} deputados em ${mandates.legislatures.length} legislaturas.`,
  );
  return dataset;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  syncDeputies().catch((error) => {
    console.error(
      `Falha na coleta de deputados; arquivos anteriores preservados. ${error?.message ?? ""}`,
    );
    process.exitCode = 1;
  });
