import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run after build. These are transfer budgets, not a substitute for field CWV.
const manifest = JSON.parse(
  await readFile(".svelte-kit/output/client/.vite/manifest.json", "utf8"),
);
const home = await readFile("build/index.html", "utf8");

// The homepage ships no framework JavaScript: only a small inline enhancement.
assert.doesNotMatch(
  home,
  /<script\b[^>]*\bsrc=|rel="modulepreload"|type="module"/,
  "Homepage must not download JavaScript modules",
);
const inline = [...home.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .join("");
const homeJs = gzipSync(inline).length;
assert.ok(
  homeJs <= 2 * 1024,
  `Homepage inline JS exceeds 2 KiB gzip: ${homeJs}`,
);

// The data explorer is the only hydrated page; it keeps the 45 KiB budget.
const dataPage = await readFile("build/dados/index.html", "utf8");
const nodes = JSON.parse(
  dataPage.match(/node_ids:\s*(\[[^\]]+\])/)?.[1] ?? "null",
);
assert.ok(
  Array.isArray(nodes),
  "Data page must expose its hydrated route nodes",
);
const roots = new Set([
  "entry/app",
  "entry/start",
  "entry/payload",
  ...nodes.map((id) => `nodes/${id}`),
]);
const files = new Set();
function visit(key) {
  const entry = manifest[key];
  assert.ok(entry, `Missing build entry: ${key}`);
  if (files.has(entry.file)) return;
  files.add(entry.file);
  for (const dependency of entry.imports ?? []) visit(dependency);
}
for (const [key, entry] of Object.entries(manifest)) {
  if (roots.has(entry.name) || key.endsWith("/runtime/client/client-entry.js"))
    visit(key);
}
let javascriptGzip = 0;
for (const file of files) {
  const bytes = await readFile(`build/${file}`);
  javascriptGzip += gzipSync(bytes).length;
  assert.doesNotMatch(
    bytes.toString(),
    /S3Client|AWS_SECRET_ACCESS_KEY|chat\/completions|siglaPartido/,
    "Bulk legislative data and server SDKs must stay out of page JS",
  );
}
assert.ok(
  javascriptGzip <= 45 * 1024,
  `Data page JS exceeds 45 KiB gzip: ${javascriptGzip}`,
);
assert.ok(
  gzipSync(home).length <= 14 * 1024,
  "Homepage HTML exceeds 14 KiB gzip",
);
assert.doesNotMatch(
  home,
  /descricaoTramitacao|ballotsUrl|sourceHash/,
  "Do not serialize full source histories on the homepage",
);
const staticPages = [
  "sobre",
  "transparencia",
  ...(await readdir("build/proposta"))
    .filter((name) => /^\d+$/.test(name))
    .map((id) => `proposta/${id}`),
];
for (const page of staticPages) {
  const html = await readFile(`build/${page}/index.html`, "utf8");
  assert.doesNotMatch(
    html,
    /<script\b|rel="modulepreload"/,
    `${page} must work without downloading or executing JavaScript`,
  );
}
console.log(
  `Performance budgets OK: homepage inline JS ${homeJs} bytes gzip, no modules; HTML ${gzipSync(home).length} bytes gzip; data page JS ${javascriptGzip} bytes gzip; ${staticPages.length} informational pages with zero JS.`,
);
