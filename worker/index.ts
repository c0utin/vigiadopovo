// The site stays a prerendered static build served from Workers assets. This
// Worker only runs for /api/* (precomputed metrics in R2) and /fotos/* (deputy
// photos in R2); see run_worker_first in wrangler.jsonc. Reads go through the
// Cache API of the data center, then Workers KV (global, 12 hours, kv.ts), and
// only then R2.
import { throughKv } from "./kv.ts";
import { metrics } from "./metrics.ts";

interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  CACHE: KVNamespace;
}

const PHOTO = /^\/fotos\/deputados\/(\d{1,9})\.jpg$/;
// Photos rarely change and are removed when a deputy leaves office.
const PHOTO_TTL = 86400;

async function photo(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const match = url.pathname.match(PHOTO);
  if (!match || (request.method !== "GET" && request.method !== "HEAD"))
    return env.ASSETS.fetch(request);
  const key = new Request(`${url.origin}${url.pathname}`);
  const conditional = request.headers.get("if-none-match");
  const hit = await caches.default.match(
    conditional
      ? new Request(key, { headers: { "if-none-match": conditional } })
      : key,
  );
  if (hit) return hit;
  const object = await throughKv<ArrayBuffer>(
    env.CACHE,
    `fotos/deputados/${match[1]}.jpg`,
    "arrayBuffer",
    async () => {
      const r2 = await env.MEDIA.get(`fotos/deputados/${match[1]}.jpg`);
      return r2 && { value: await r2.arrayBuffer(), etag: r2.httpEtag };
    },
    (p) => ctx.waitUntil(p),
  );
  const headers = new Headers({
    "cache-control": `public, max-age=${PHOTO_TTL}`,
  });
  let response;
  if (!object) {
    // Cached too, so repeated unknown IDs do not reach R2 again.
    headers.set("content-type", "text/plain; charset=utf-8");
    response = new Response("Foto não encontrada", { status: 404, headers });
  } else {
    headers.set("content-type", "image/jpeg");
    headers.set("etag", object.etag);
    response = new Response(object.value, { headers });
  }
  ctx.waitUntil(caches.default.put(key, response.clone()));
  if (object && conditional === object.etag)
    return new Response(null, { status: 304, headers });
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/fotos/")) return photo(request, env, ctx);
    if (pathname === "/api/metricas" || pathname.startsWith("/api/metricas/"))
      return metrics(
        request,
        {
          get: async (key) => {
            const entry = await throughKv<string>(
              env.CACHE,
              key,
              "text",
              async () => {
                const r2 = await env.MEDIA.get(key);
                return r2 && { value: await r2.text(), etag: r2.etag };
              },
              (p) => ctx.waitUntil(p),
            );
            return entry && { text: async () => entry.value, etag: entry.etag };
          },
        },
        caches.default,
        (p) => ctx.waitUntil(p),
      );
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
