// Serves /pipeline/v1/* from the public repository instead of Workers assets,
// whose free plan allows 20,000 files per version while the archive grows by
// hundreds a day. Every file under v1/ is named by the SHA-256 of its bytes,
// so the Worker checks the hash before serving: GitHub can fail to deliver a
// file, but cannot make this site serve a different one.
const PATH = /^\/pipeline\/v1\/[a-z]+\/([0-9a-f]{64})\.json$/;
const ORIGIN =
  "https://raw.githubusercontent.com/c0utin/vigiadopovo/main/static";

type EdgeCache = Pick<Cache, "match" | "put">;

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export async function servePipeline(
  request: Request,
  fetchOrigin: (url: string) => Promise<Response>,
  cache: EdgeCache,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const digest = PATH.exec(pathname)?.[1];
  if (!digest || (request.method !== "GET" && request.method !== "HEAD"))
    return new Response("Not found\n", { status: 404 });
  const key = new Request(new URL(pathname, request.url));
  const cached = await cache.match(key);
  if (cached) return cached;
  const upstream = await fetchOrigin(`${ORIGIN}${pathname}`);
  if (upstream.status === 404)
    return new Response("Not found\n", { status: 404 });
  const body = upstream.ok ? await upstream.arrayBuffer() : null;
  if (!body || hex(await crypto.subtle.digest("SHA-256", body)) !== digest)
    return new Response("Bad gateway: file unavailable or hash mismatch\n", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  const response = new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  waitUntil(cache.put(key, response.clone()));
  return response;
}
