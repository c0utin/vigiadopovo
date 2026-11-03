import { existsSync } from "node:fs";
import provenance from "#lib/data/provenance.json";

// All interactions are native links and <details>; hydration is unnecessary.
export const csr = false;

// Prerendered at build time, so these describe the published snapshot.
export const load = () => ({
  timestamp: existsSync(
    `static/pipeline/timestamps/${provenance.manifestHash}.json.ots`,
  ),
  repository: process.env.GITHUB_REPOSITORY ?? "c0utin/vigiadopovo",
});
