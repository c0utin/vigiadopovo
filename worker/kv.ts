// Global cache between each data center's caches and R2. Workers KV is
// replicated, so a file is read from R2 at most once per KV_TTL for the whole
// network instead of once per data center and isolate.
//
// Free plan: 100k reads and 1,000 writes a day. A write happens only on a
// miss, at most once per key per KV_TTL; past the daily limit KV refuses the
// write (no charge) and the next request reads R2 again. Any KV failure falls
// back to R2: the cache never decides what is served, only where it is read.
export const KV_TTL = 12 * 3600;

// The two KVNamespace operations used, typed here so this module needs no
// Workers globals (svelte-check also reads it through the tests).
export type Kv = {
  getWithMetadata<M>(
    key: string,
    type: "text" | "arrayBuffer",
  ): Promise<{ value: string | ArrayBuffer | null; metadata: M | null }>;
  put(
    key: string,
    value: string | ArrayBuffer,
    options: { expirationTtl: number; metadata: unknown },
  ): Promise<void>;
};
type Entry<T> = { value: T; etag: string };

export async function throughKv<T extends string | ArrayBuffer>(
  kv: Kv,
  key: string,
  type: T extends string ? "text" : "arrayBuffer",
  origin: () => Promise<Entry<T> | null>,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Entry<T> | null> {
  const hit = await kv
    .getWithMetadata<{ etag: string }>(key, type)
    .catch(() => null);
  if (hit?.value != null && hit.metadata?.etag)
    return { value: hit.value as unknown as T, etag: hit.metadata.etag };
  const fresh = await origin();
  // Misses (unknown keys) are not stored: they would spend the write quota.
  if (fresh)
    waitUntil(
      kv
        .put(key, fresh.value, {
          expirationTtl: KV_TTL,
          metadata: { etag: fresh.etag },
        })
        .catch(() => {}),
    );
  return fresh;
}
