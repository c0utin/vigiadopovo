import { existsSync, readFileSync } from "node:fs";
import type { DeputiesDataset, MandatesDataset } from "#lib/deputies.ts";

// Written by `pnpm data:deputies` (the deploy runs it) and not versioned:
// without it the site still builds, with an empty list.
const read = <T>(path: string): T | null =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;

export const deputies = read<DeputiesDataset>("static/deputados.json");

// Every deputy since 1826, also written by `pnpm data:deputies`.
export const mandates = read<MandatesDataset>("static/deputados-mandatos.json");
