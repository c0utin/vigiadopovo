// Publishes the Worker's metrics as JSON in the media bucket, so visitors never
// trigger a query. The input is one file per year written by lake/ once that
// year's batch is complete: `lake/.lake/metricas/<ano>.json` (`pnpm data:lake` runs in lake/), relative to the
// repository root, with this contract:
//
//   {
//     "lote": "<sha256 hex of the batch>",
//     "alinhamento": [row, ...],
//     "deputados": [row, ...],
//     "votacoes": [row, ...],
//     "fontes": [row, ...]   // the four bronze.arquivos rows of the batch
//   }
//
// A row is a flat object of JSON scalars (string, number, boolean or null) with
// the columns of the ouro and bronze queries. A year is published again only
// when its `lote` differs from indice.json. Files are written before
// indice.json, which is written last. Run `pnpm budget` first: this step only
// writes.
//
//   pnpm data:metrics
//
// Env: CLOUDFLARE_API_TOKEN (wrangler writes to the media bucket).
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Console,
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Path,
  Schema,
  Stream,
} from "effect";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { BLOCS, PREFIX } from "../worker/definitions.ts";

const INPUT = "lake/.lake/metricas";
const INDEX = `${PREFIX}/indice.json`;
const MEDIA = "vigia-media";

class MetricsError extends Schema.TaggedError<MetricsError>()("MetricsError", {
  message: Schema.String,
}) {}

const Row = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]),
);
type Row = typeof Row.Type;

const LakeYear = Schema.Struct({
  lote: Schema.String,
  alinhamento: Schema.Array(Row),
  deputados: Schema.Array(Row),
  votacoes: Schema.Array(Row),
  fontes: Schema.Array(Row),
});
type LakeYear = typeof LakeYear.Type;

const Index = Schema.Struct({
  anos: Schema.Record(
    Schema.String,
    Schema.Struct({ fingerprint: Schema.String, calculado_em: Schema.String }),
  ),
  atualizado_em: Schema.optionalKey(Schema.String),
});
type Index = typeof Index.Type;

// The batch hashes the same "arquivo:sha256" lines: recomputing it checks that
// the four rows are the batch they claim to be.
const fingerprint = (fontes: readonly Row[]) =>
  createHash("sha256")
    .update(
      fontes
        .map((r) => `${r.arquivo}:${r.sha256}`)
        .sort()
        .join("\n"),
    )
    .digest("hex");

// The four published files of one year, with the same keys as before.
export const publishedYear = Effect.fn("publishedYear")(function* (
  ano: number,
  lake: LakeYear,
  calculado_em: string,
) {
  if (lake.fontes.length !== 4 || fingerprint(lake.fontes) !== lake.lote)
    return yield* new MetricsError({
      message: `Lote de ${ano} não confere com as fontes`,
    });
  const bancadas: Record<string, Row[]> = Object.fromEntries(
    BLOCS.map((b) => [b, []]),
  );
  // A bloco outside BLOCS is not published.
  for (const { bloco, ...row } of lake.alinhamento)
    if (
      typeof bloco === "string" &&
      (BLOCS as readonly string[]).includes(bloco)
    )
      bancadas[bloco]?.push(row);
  const byDeputy: Record<string, Row[]> = {};
  for (const { deputado, ...row } of lake.deputados)
    (byDeputy[String(deputado)] ??= []).push(row);
  return {
    alinhamento: { ano, calculado_em, bancadas },
    deputados: { ano, calculado_em, deputados: byDeputy },
    votacoes: { ano, calculado_em, linhas: lake.votacoes },
    fontes: { ano, calculado_em, linhas: lake.fontes },
  };
});

// Years whose batch differs from the published index, newest first, so a
// partial run still updates the current year.
export const pendingYears = <Y extends { ano: number; lote: string }>(
  index: Index,
  years: readonly Y[],
): Y[] =>
  years
    .filter((y) => index.anos[y.ano]?.fingerprint !== y.lote)
    .sort((a, b) => b.ano - a.ano);

// Runs wrangler against the media bucket and returns its exit code and output.
const wrangler = Effect.fn("wrangler")(function* (
  args: readonly string[],
  stdin?: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make(
      "wrangler",
      ["r2", "object", ...args, "--remote"],
      stdin === undefined
        ? {}
        : { stdin: Stream.make(new TextEncoder().encode(stdin)) },
    ),
  );
  const [stdout, stderr, code] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
    ],
    { concurrency: "unbounded" },
  );
  return { code, stdout, stderr };
}, Effect.scoped);

// Missing keys are null; any other failure stops the run.
const read = Effect.fn("read")(function* (key: string) {
  const { code, stdout, stderr } = yield* wrangler([
    "get",
    `${MEDIA}/${key}`,
    "--pipe",
  ]);
  if (code === 0) return stdout;
  if (/specified key does not exist/.test(stderr)) return null;
  return yield* new MetricsError({ message: `wrangler get ${key}: ${stderr}` });
});

const write = Effect.fn("write")(function* (key: string, value: unknown) {
  const { code, stderr } = yield* wrangler(
    [
      "put",
      `${MEDIA}/${key}`,
      "--pipe",
      "--content-type",
      "application/json; charset=utf-8",
    ],
    JSON.stringify(value),
  );
  if (code !== 0)
    return yield* new MetricsError({
      message: `wrangler put ${key}: ${stderr}`,
    });
});

const readLake = Effect.fn("readLake")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = (yield* fs.readDirectory(INPUT))
    .filter((name) => /^\d{4}\.json$/.test(name))
    .sort();
  return yield* Effect.forEach(names, (name) =>
    fs.readFileString(path.join(INPUT, name)).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(LakeYear)),
      ),
      Effect.map((lake) => ({ ano: Number(name.slice(0, 4)), lake })),
    ),
  );
});

const publish = Effect.gen(function* () {
  const calculado_em = DateTime.formatIso(yield* DateTime.now);
  // Every year is shaped before anything is uploaded, so a bad input file
  // stops the run with nothing published.
  const years = yield* Effect.forEach(yield* readLake(), ({ ano, lake }) =>
    publishedYear(ano, lake, calculado_em).pipe(
      Effect.map((files) => ({ ano, lote: lake.lote, lake, files })),
    ),
  );
  const raw = yield* read(INDEX);
  const index: Index =
    raw === null
      ? { anos: {} }
      : yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Index))(raw);
  const pending = pendingYears(index, years);
  yield* Console.log(
    pending.length
      ? `Recalculando: ${pending.map((y) => y.ano).join(", ")}`
      : "Nenhum ano com fontes novas; nada a recalcular.",
  );

  const anos = { ...index.anos };
  // Stops at the first failure but keeps the years already published.
  const outcome = yield* Effect.forEach(
    pending,
    (year) =>
      Effect.gen(function* () {
        for (const [name, body] of Object.entries(year.files))
          yield* write(`${PREFIX}/${year.ano}/${name}.json`, body);
        anos[year.ano] = { fingerprint: year.lote, calculado_em };
        yield* Console.log(
          `${year.ano}: ${Object.keys(year.files.deputados.deputados).length} deputados, ${year.lake.alinhamento.length} linhas de alinhamento, ${year.lake.votacoes.length} meses`,
        );
      }),
    { discard: true },
  ).pipe(Effect.exit);
  if (pending.length)
    yield* write(INDEX, { anos, atualizado_em: calculado_em });
  if (Exit.isFailure(outcome)) return yield* Effect.failCause(outcome.cause);
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  publish.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
