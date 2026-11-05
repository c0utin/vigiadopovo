import { DateTime, Effect } from "effect";
import { encode, hash } from "./content.ts";

type Artifact = {
  kind: "raw" | "normalized" | "legislative";
  value: unknown;
};

// Content-addressed: equal values always get the same key and bytes, so published objects never change.
export const archiveRun = Effect.fn("archiveRun")(function* (
  artifacts: readonly Artifact[],
) {
  const createdAt = DateTime.formatIso(yield* DateTime.now);
  const objects = new Map<string, string>();
  const entries = artifacts.map(({ kind, value }) => {
    const sha256 = hash(value);
    const key = `v1/${kind}/${sha256}.json`;
    const body = encode(value);
    objects.set(key, body);
    return { kind, key, sha256, bytes: Buffer.byteLength(body) };
  });
  const manifest = {
    schemaVersion: 1 as const,
    createdAt,
    artifacts: entries,
  };
  const key = `v1/manifests/${hash(manifest)}.json`;
  objects.set(key, encode(manifest));
  return { key, manifest, objects };
});
