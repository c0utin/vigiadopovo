// The site stays a prerendered static build served from Workers assets. This
// Worker only runs for /api/* (precomputed metrics in R2) and /fotos/* (deputy
// photos in R2); see run_worker_first in wrangler.jsonc. Reads go through the
// Cache API of the data center, and only then R2.
import { metrics } from "./metrics.ts";

interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
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
  const object = await env.MEDIA.get(`fotos/deputados/${match[1]}.jpg`);
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
    headers.set("etag", object.httpEtag);
    response = new Response(object.body, { headers });
  }
  ctx.waitUntil(caches.default.put(key, response.clone()));
  if (object && conditional === object.httpEtag)
    return new Response(null, { status: 304, headers });
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/fotos/")) return photo(request, env, ctx);
    if (pathname === "/api/metricas" || pathname.startsWith("/api/metricas/"))
      return metrics(request, env.MEDIA, caches.default, (p) =>
        ctx.waitUntil(p),
      );
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
