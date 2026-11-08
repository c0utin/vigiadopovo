// Replays the published scoring: reads the scoring input written by
// `pnpm data:deputies`, checks its hash, recomputes every score offline and
// checks that the result hashes to the published `quality.outputSha256`.
// Usage: pnpm data:quality [input.json] [deputados.json]
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { encodeCompact } from "./pipeline/content.ts";
import { scoreQuality } from "./pipeline/quality.ts";

const [
  inputPath = "static/deputados-qualidade-entrada.json",
  datasetPath = "static/deputados.json",
] = process.argv.slice(2);
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const bytes = await readFile(inputPath, "utf8");
const { quality } = JSON.parse(await readFile(datasetPath, "utf8"));
const input = JSON.parse(bytes);
const checks = [
  ["entrada", sha256(bytes), quality.inputSha256],
  ["entrada canônica", sha256(encodeCompact(input)), quality.inputSha256],
  [
    "resultado",
    sha256(encodeCompact(scoreQuality(input))),
    quality.outputSha256,
  ],
];
for (const [name, actual, expected] of checks)
  console.log(
    `${actual === expected ? "ok" : "DIFERENTE"}  ${name}  ${actual}`,
  );
if (checks.some(([, actual, expected]) => actual !== expected)) process.exit(1);
