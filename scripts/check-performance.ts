import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Schema } from "effect";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

// Run after build. These are transfer budgets, not a substitute for field CWV.
class PerformanceError extends Schema.TaggedError<PerformanceError>()(
  "PerformanceError",
  { message: Schema.String },
) {}

const expect = (ok: boolean, message: string) =>
  ok ? Effect.void : Effect.fail(new PerformanceError({ message }));

const MODULES = /<script\b[^>]*\bsrc=|rel="modulepreload"|type="module"/;

// Lists the numbered route directories, e.g. build/proposta/12.
const numbered = (fs: FileSystem.FileSystem, route: string) =>
  fs
    .readDirectory(`build/${route}`)
    .pipe(
      Effect.map((names) =>
        names
          .filter((name) => /^\d+$/.test(name))
          .map((id) => `${route}/${id}`),
      ),
    );

const checkPerformance = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const manifest = JSON.parse(
    yield* fs.readFileString(".svelte-kit/output/client/.vite/manifest.json"),
  );
  const home = yield* fs.readFileString("build/index.html");

  // The homepage ships no framework JavaScript: only a small inline enhancement.
  yield* expect(
    !MODULES.test(home),
    "Homepage must not download JavaScript modules",
  );
  const inline = [...home.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join("");
  const homeJs = gzipSync(inline).length;
  yield* expect(
    homeJs <= 2 * 1024,
    `Homepage inline JS exceeds 2 KiB gzip: ${homeJs}`,
  );

  // The data explorer is the only hydrated page; it keeps the 46 KiB budget.
  const dataPage = yield* fs.readFileString("build/dados/index.html");
  const nodes = JSON.parse(
    dataPage.match(/node_ids:\s*(\[[^\]]+\])/)?.[1] ?? "null",
  );
  yield* expect(
    Array.isArray(nodes),
    "Data page must expose its hydrated route nodes",
  );
  const roots = new Set([
    "entry/app",
    "entry/start",
    "entry/payload",
    ...nodes.map((id: number) => `nodes/${id}`),
  ]);
  const files = new Set<string>();
  const visit = (key: string): Effect.Effect<void, PerformanceError> =>
    Effect.gen(function* () {
      const entry = manifest[key];
      yield* expect(!!entry, `Missing build entry: ${key}`);
      if (files.has(entry.file)) return;
      files.add(entry.file);
      for (const dependency of entry.imports ?? []) yield* visit(dependency);
    });
  for (const [key, entry] of Object.entries<any>(manifest))
    if (
      roots.has(entry.name) ||
      key.endsWith("/runtime/client/client-entry.js")
    )
      yield* visit(key);
  let javascriptGzip = 0;
  for (const file of files) {
    const bytes = yield* fs.readFile(`build/${file}`);
    javascriptGzip += gzipSync(bytes).length;
    yield* expect(
      !/S3Client|AWS_SECRET_ACCESS_KEY|chat\/completions|siglaPartido/.test(
        new TextDecoder().decode(bytes),
      ),
      "Bulk legislative data and server SDKs must stay out of page JS",
    );
  }
  yield* expect(
    javascriptGzip <= 46 * 1024,
    `Data page JS exceeds 46 KiB gzip: ${javascriptGzip}`,
  );
  const homeHtml = gzipSync(home).length;
  yield* expect(homeHtml <= 14 * 1024, "Homepage HTML exceeds 14 KiB gzip");
  yield* expect(
    !/descricaoTramitacao|ballotsUrl|sourceHash/.test(home),
    "Do not serialize full source histories on the homepage",
  );
  // The deputies list, like the homepage, may only carry a small inline script.
  const deputies = yield* fs.readFileString("build/deputados/index.html");
  yield* expect(
    !MODULES.test(deputies),
    "Deputies list must not download JavaScript modules",
  );
  const deputiesHtml = gzipSync(deputies).length;
  yield* expect(
    deputiesHtml <= 40 * 1024,
    `Deputies list HTML exceeds 40 KiB gzip: ${deputiesHtml}`,
  );
  const staticPages = [
    "sobre",
    "transparencia",
    ...(yield* numbered(fs, "proposta")),
    ...(yield* numbered(fs, "deputados")),
  ];
  for (const page of staticPages) {
    const html = yield* fs.readFileString(`build/${page}/index.html`);
    yield* expect(
      !/<script\b|rel="modulepreload"/.test(html),
      `${page} must work without downloading or executing JavaScript`,
    );
  }
  yield* Console.log(
    `Performance budgets OK: homepage inline JS ${homeJs} bytes gzip, no modules; HTML ${homeHtml} bytes gzip; data page JS ${javascriptGzip} bytes gzip; ${staticPages.length} informational pages with zero JS.`,
  );
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  checkPerformance.pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
