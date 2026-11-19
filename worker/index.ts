// The site, deputy photos included, stays a prerendered static build served
// from Workers assets. This Worker only runs for /api/* (precomputed metrics in
// R2) and /pipeline/v1/* (the content-addressed archive, see pipeline.ts); see
// run_worker_first in wrangler.jsonc. Reads go through the Cache API of the
// data center first.
import { Effect } from "effect";
import { serveMetrics } from "./metrics.ts";
import { servePipeline } from "./pipeline.ts";

interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
}

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const response =
      pathname === "/api/metricas" || pathname.startsWith("/api/metricas/")
        ? serveMetrics(request, env.MEDIA, caches.default, (p) =>
            ctx.waitUntil(p),
          )
        : pathname.startsWith("/pipeline/v1/")
          ? Effect.promise(() =>
              servePipeline(request, fetch, caches.default, (p) =>
                ctx.waitUntil(p),
              ),
            )
          : Effect.promise(() => env.ASSETS.fetch(request));
    return Effect.runPromise(response);
  },
} satisfies ExportedHandler<Env>;
