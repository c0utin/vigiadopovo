import { existsSync, readFileSync } from "node:fs";
import type { DeputiesDataset, MandatesDataset } from "#lib/deputies.ts";

// Written by `pnpm data:deputies` (deputies.yml commits it monthly): without it
// the site still builds, with an empty list.
const read = <T>(path: string): T | null =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;

export const deputies = read<DeputiesDataset>("static/deputados.json");

// Every deputy since 1826, also written by `pnpm data:deputies`.
export const mandates = read<MandatesDataset>("static/deputados-mandatos.json");

// Median quality points of the deputies in office, for the profile's
// "deputy vs chamber" comparison.
export const medianPoints = (() => {
  // Datasets collected before the quality score have no `score`.
  const sorted = (deputies?.deputies ?? [])
    .flatMap((d) => (d.score ? [d.score.points] : []))
    .toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return null;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
})();
