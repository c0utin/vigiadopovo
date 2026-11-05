// Global cache between each data center's caches and R2, in the D1 database
// `vigia-cache` (table in migrations/0001_cache.sql). A file is read from R2
// at most once per CACHE_TTL for the whole network instead of once per data
// center and isolate.
//
// Free plan: 5 million rows read and 100k rows written a day. A read costs one
// row (primary key lookup); a write happens only on a miss, at most once per
// key per CACHE_TTL. Past the daily limit D1 refuses queries (no charge). Any
// D1 failure falls back to R2: the cache never decides what is served, only
// where it is read.
export const CACHE_TTL = 12 * 3600;

// The D1Database operations used, typed here so this module needs no Workers
// globals (svelte-check also reads it through the tests).
export type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<R>(): Promise<R | null>;
      run(): Promise<unknown>;
    };
  };
};
type Entry<T> = { value: T; etag: string };

export async function throughDb<T extends string | ArrayBuffer>(
  db: Db,
  key: string,
  origin: () => Promise<Entry<T> | null>,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Entry<T> | null> {
  const now = Math.floor(Date.now() / 1000);
  const hit = await db
    .prepare("SELECT value, etag FROM cache WHERE key = ? AND expires > ?")
    .bind(key, now)
    .first<{ value: string | number[]; etag: string }>()
    .catch(() => null);
  if (hit)
    return {
      // D1 returns a BLOB as an array of bytes.
      value: (typeof hit.value === "string"
        ? hit.value
        : new Uint8Array(hit.value).buffer) as T,
      etag: hit.etag,
    };
  const fresh = await origin();
  // Misses (unknown keys) are not stored: they would spend the write quota.
  if (fresh)
    waitUntil(
      db
        .prepare(
          "INSERT OR REPLACE INTO cache (key, value, etag, expires) VALUES (?, ?, ?, ?)",
        )
        .bind(key, fresh.value, fresh.etag, now + CACHE_TTL)
        .run()
        .catch(() => {}),
    );
  return fresh;
}
