// Serves metrics precomputed by scripts/metrics.ts. Visitors never reach R2
// SQL: every response is a slice of a JSON object in R2, so a request costs at
// most one R2 read (Class B), and usually none:
//   1. Cache API (per data center), keyed by the resolved query;
//   2. memory of this isolate, one parsed file per metric and year;
//   3. R2 `metricas/v1/<ano>/<metrica>.json`.
// Past years change only on a backfill, so they are cached longer.
import { Context, Effect, Schema } from "effect";
import {
  BLOCS,
  DEFINITIONS,
  FIRST_YEAR,
  PREFIX,
  SOURCE,
  currentYear,
} from "./definitions.ts";

type File = { etag: string; data: any; expires: number };
type Store = {
  get(key: string): Promise<{ text(): Promise<string>; etag: string } | null>;
};
type EdgeCache = Pick<Cache, "match" | "put">;
type Waiter = (promise: Promise<unknown>) => void;

class Bucket extends Context.Service<Bucket, Store>()("vigia/worker/Bucket") {}
class Edge extends Context.Service<Edge, EdgeCache>()("vigia/worker/Edge") {}
// `waitUntil`: lets a cache write finish after the response is sent.
class Background extends Context.Service<Background, Waiter>()(
  "vigia/worker/Background",
) {}

class BadRequest extends Schema.TaggedError<BadRequest>()("BadRequest", {
  message: Schema.String,
}) {}
class StoreError extends Schema.TaggedError<StoreError>()("StoreError", {
  key: Schema.String,
  reason: Schema.Unknown,
}) {}
class CacheError extends Schema.TaggedError<CacheError>()("CacheError", {
  url: Schema.String,
  reason: Schema.Unknown,
}) {}

const MEMORY = new Map<string, File>();
const MEMORY_FILES = 16;

function year(params: URLSearchParams): Effect.Effect<number, BadRequest> {
  const raw = params.get("ano");
  if (raw === null) return Effect.succeed(currentYear());
  const value = Number(raw);
  if (!/^\d{4}$/.test(raw) || value < FIRST_YEAR || value > currentYear())
    return Effect.fail(
      new BadRequest({
        message: `ano deve estar entre ${FIRST_YEAR} e o ano atual`,
      }),
    );
  return Effect.succeed(value);
}

// Resolves a request to one file and the part of it to return.
const route = Effect.fn("route")(function* (
  path: string,
  params: URLSearchParams,
) {
  const ano = yield* year(params);
  if (path === "/api/metricas/alinhamento") {
    const bancada = params.get("bancada") ?? "Governo";
    if (!(BLOCS as readonly string[]).includes(bancada))
      return yield* Effect.fail(
        new BadRequest({
          message: `bancada deve ser uma de: ${BLOCS.join(", ")}`,
        }),
      );
    return {
      name: "alinhamento" as const,
      file: "alinhamento",
      ano,
      extra: { bancada },
      pick: (data: any) => data.bancadas[bancada] ?? [],
    };
  }
  const deputy = path.match(/^\/api\/metricas\/deputados\/(\d{1,9})$/);
  if (deputy) {
    const id = Number(deputy[1]);
    return {
      name: "deputado" as const,
      file: "deputados",
      ano,
      extra: { deputado: id },
      pick: (data: any) => data.deputados[id] ?? null,
    };
  }
  const plain = path.match(/^\/api\/metricas\/(votacoes|fontes)$/);
  if (plain) {
    const name = plain[1] as "votacoes" | "fontes";
    return {
      name,
      file: name,
      ano,
      extra: {},
      pick: (data: any) => data.linhas,
    };
  }
  return yield* Effect.fail(
    new BadRequest({ message: "métrica desconhecida" }),
  );
});

const load = Effect.fn("load")(function* (key: string, ttl: number) {
  const cached = MEMORY.get(key);
  if (cached && cached.expires > Date.now()) return cached;
  const bucket = yield* Bucket;
  const object = yield* Effect.tryPromise({
    try: () => bucket.get(key),
    catch: (reason) => new StoreError({ key, reason }),
  });
  if (!object) return null;
  const data = yield* Effect.tryPromise({
    try: async () => JSON.parse(await object.text()),
    catch: (reason) => new StoreError({ key, reason }),
  });
  const file: File = {
    etag: object.etag,
    data,
    expires: Date.now() + ttl * 1000,
  };
  MEMORY.delete(key);
  MEMORY.set(key, file);
  // Map keeps insertion order: drop the least recently loaded file.
  if (MEMORY.size > MEMORY_FILES) MEMORY.delete(MEMORY.keys().next().value!);
  return file;
});

// The write runs in the background: a failure is reported to waitUntil and
// never changes the response.
const remember = Effect.fn("remember")(function* (
  url: string,
  response: Response,
) {
  const edge = yield* Edge;
  const background = yield* Background;
  background(
    Effect.runPromise(
      Effect.tryPromise({
        try: () => edge.put(new Request(url), response),
        catch: (reason) => new CacheError({ url, reason }),
      }),
    ),
  );
});

const json = (status: number, value: unknown, headers: HeadersInit) =>
  new Response(status === 304 ? null : JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...headers,
    },
  });

const respond = (
  request: Request,
): Effect.Effect<
  Response,
  BadRequest | StoreError | CacheError,
  Bucket | Edge | Background
> =>
  Effect.gen(function* () {
    if (request.method !== "GET" && request.method !== "HEAD")
      return json(405, { erro: "use GET" }, { "cache-control": "no-store" });
    const url = new URL(request.url);
    if (url.pathname === "/api/metricas" || url.pathname === "/api/metricas/")
      return json(
        200,
        {
          metricas: {
            "/api/metricas/alinhamento?ano=&bancada=": DEFINITIONS.alinhamento,
            "/api/metricas/deputados/{id}?ano=": DEFINITIONS.deputado,
            "/api/metricas/votacoes?ano=": DEFINITIONS.votacoes,
            "/api/metricas/fontes?ano=": DEFINITIONS.fontes,
          },
          bancadas: BLOCS,
        },
        { "cache-control": "public, max-age=86400" },
      );

    const selected = yield* route(url.pathname, url.searchParams);
    const ttl = selected.ano === currentYear() ? 3600 : 86400;
    const extra = encodeURIComponent(JSON.stringify(selected.extra));
    // One entry per resolved query, whatever the parameter order or extras.
    const keyUrl = `${url.origin}/api/metricas/_cache/v1/${selected.name}/${selected.ano}/${extra}`;
    const conditional = request.headers.get("if-none-match");
    const edge = yield* Edge;
    const hit = yield* Effect.tryPromise({
      try: () =>
        edge.match(
          new Request(
            keyUrl,
            conditional ? { headers: { "if-none-match": conditional } } : {},
          ),
        ),
      catch: (reason) => new CacheError({ url: keyUrl, reason }),
    });
    if (hit) return hit;

    const file = yield* load(
      `${PREFIX}/${selected.ano}/${selected.file}.json`,
      ttl,
    );
    // Without ?ano=, early January has no metrics for the new year yet: answer
    // with the previous year, cached under this key like a current-year reply.
    if (!file && !url.searchParams.has("ano") && selected.ano > FIRST_YEAR) {
      const previous = new URL(url);
      previous.searchParams.set("ano", String(selected.ano - 1));
      const fallback = yield* respond(
        new Request(previous, { headers: request.headers }),
      );
      if (fallback.status === 304) return fallback;
      const response = new Response(fallback.body, fallback);
      response.headers.set("cache-control", `public, max-age=${ttl}`);
      yield* remember(keyUrl, response.clone());
      return response;
    }

    const rows = file && selected.pick(file.data);
    const cacheControl = { "cache-control": `public, max-age=${ttl}` };
    let response: Response;
    let etag: string | null = null;
    if (!file)
      response = json(
        404,
        { erro: "métrica ainda não calculada para este ano" },
        cacheControl,
      );
    else if (rows === null)
      response = json(
        404,
        { erro: "nenhum voto registrado deste deputado no ano" },
        cacheControl,
      );
    else {
      etag = `W/"${file.etag}-${selected.name}-${extra}"`;
      response = json(
        200,
        {
          metrica: selected.name,
          ano: selected.ano,
          ...selected.extra,
          definicao: DEFINITIONS[selected.name],
          fonte: SOURCE,
          calculado_em: file.data.calculado_em,
          linhas: rows,
        },
        { ...cacheControl, etag },
      );
    }
    yield* remember(keyUrl, response.clone());
    if (etag !== null && conditional === etag)
      return json(304, null, { ...cacheControl, etag });
    return response;
  });

// Unknown-request answers are data (400); store and cache faults are defects,
// so the Worker fails with a 500 as it did before the typed errors.
export const serveMetrics = (
  request: Request,
  store: Store,
  cache: EdgeCache,
  waitUntil: Waiter,
) =>
  respond(request).pipe(
    Effect.catchTag("BadRequest", (error) =>
      Effect.succeed(
        json(400, { erro: error.message }, { "cache-control": "no-store" }),
      ),
    ),
    Effect.provideService(Bucket, store),
    Effect.provideService(Edge, cache),
    Effect.provideService(Background, waitUntil),
    Effect.orDie,
  );

export function metrics(
  request: Request,
  store: Store,
  cache: EdgeCache,
  waitUntil: Waiter,
): Promise<Response> {
  return Effect.runPromise(serveMetrics(request, store, cache, waitUntil));
}
