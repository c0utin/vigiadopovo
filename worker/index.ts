// The site, deputy photos included, stays a prerendered static build served
// from Workers assets. This Worker only runs for /api/* (precomputed metrics in
// R2); see run_worker_first in wrangler.jsonc. Reads go through the Cache API
// of the data center, and only then R2.
import { metrics } from "./metrics.ts";

interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/metricas" || pathname.startsWith("/api/metricas/"))
      return metrics(request, env.MEDIA, caches.default, (p) =>
        ctx.waitUntil(p),
      );
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
