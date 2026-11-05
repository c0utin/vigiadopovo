// Serves metrics precomputed by scripts/metrics.ts. Visitors never reach R2
// SQL: every response is a slice of a JSON object in R2, so a request costs at
// most one R2 read (Class B), and usually none:
//   1. Cache API (per data center), keyed by the resolved query;
//   2. memory of this isolate, one parsed file per metric and year;
//   3. R2 `metricas/v1/<ano>/<metrica>.json`.
// Past years change only on a backfill, so they are cached longer.
import {
  BLOCS,
  DEFINITIONS,
  FIRST_YEAR,
  PREFIX,
  SOURCE,
  currentYear,
} from "./definitions.ts";

type File = { etag: string; data: any; expires: number };
export type Store = {
  get(key: string): Promise<{ text(): Promise<string>; etag: string } | null>;
};

class BadRequest extends Error {}

const MEMORY = new Map<string, File>();
const MEMORY_FILES = 16;

function year(params: URLSearchParams) {
  const raw = params.get("ano");
  if (raw === null) return currentYear();
  const value = Number(raw);
  if (!/^\d{4}$/.test(raw) || value < FIRST_YEAR || value > currentYear())
    throw new BadRequest(`ano deve estar entre ${FIRST_YEAR} e o ano atual`);
  return value;
}

// Resolves a request to one file and the part of it to return.
function route(path: string, params: URLSearchParams) {
  const ano = year(params);
  if (path === "/api/metricas/alinhamento") {
    const bancada = params.get("bancada") ?? "Governo";
    if (!(BLOCS as readonly string[]).includes(bancada))
      throw new BadRequest(`bancada deve ser uma de: ${BLOCS.join(", ")}`);
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
  if (path === "/api/metricas/votacoes" || path === "/api/metricas/fontes") {
    const name: "votacoes" | "fontes" = path.endsWith("votacoes")
      ? "votacoes"
      : "fontes";
    return {
      name,
      file: name,
      ano,
      extra: {},
      pick: (data: any) => data.linhas,
    };
  }
  throw new BadRequest("métrica desconhecida");
}

async function load(store: Store, key: string, ttl: number) {
  const cached = MEMORY.get(key);
  if (cached && cached.expires > Date.now()) return cached;
  const object = await store.get(key);
  if (!object) return null;
  const file = {
    etag: object.etag,
    data: JSON.parse(await object.text()),
    expires: Date.now() + ttl * 1000,
  };
  MEMORY.delete(key);
  MEMORY.set(key, file);
  // Map keeps insertion order: drop the least recently loaded file.
  if (MEMORY.size > MEMORY_FILES) MEMORY.delete(MEMORY.keys().next().value!);
  return file;
}

const json = (status: number, value: unknown, headers: HeadersInit) =>
  new Response(status === 304 ? null : JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...headers,
    },
  });

export async function metrics(
  request: Request,
  store: Store,
  cache: Pick<Cache, "match" | "put">,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
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

  let selected;
  try {
    selected = route(url.pathname, url.searchParams);
  } catch (error) {
    if (error instanceof BadRequest)
      return json(
        400,
        { erro: error.message },
        { "cache-control": "no-store" },
      );
    throw error;
  }
  const ttl = selected.ano === currentYear() ? 3600 : 86400;
  // One entry per resolved query, whatever the parameter order or extras.
  const keyUrl = `${url.origin}/api/metricas/_cache/v1/${selected.name}/${selected.ano}/${encodeURIComponent(JSON.stringify(selected.extra))}`;
  const conditional = request.headers.get("if-none-match");
  const hit = await cache.match(
    new Request(
      keyUrl,
      conditional ? { headers: { "if-none-match": conditional } } : {},
    ),
  );
  if (hit) return hit;

  const file = await load(
    store,
    `${PREFIX}/${selected.ano}/${selected.file}.json`,
    ttl,
  );
  // Without ?ano=, early January has no metrics for the new year yet: answer
  // with the previous year, cached under this key like a current-year reply.
  if (!file && !url.searchParams.has("ano") && selected.ano > FIRST_YEAR) {
    const previous = new URL(url);
    previous.searchParams.set("ano", String(selected.ano - 1));
    const fallback = await metrics(
      new Request(previous, { headers: request.headers }),
      store,
      cache,
      waitUntil,
    );
    if (fallback.status === 304) return fallback;
    const response = new Response(fallback.body, fallback);
    response.headers.set("cache-control", `public, max-age=${ttl}`);
    waitUntil(cache.put(new Request(keyUrl), response.clone()));
    return response;
  }
  const rows = file && selected.pick(file.data);
  const cacheControl = { "cache-control": `public, max-age=${ttl}` };
  let response;
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
    const etag = `W/"${file.etag}-${selected.name}-${encodeURIComponent(JSON.stringify(selected.extra))}"`;
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
    if (conditional === etag) {
      waitUntil(cache.put(new Request(keyUrl), response));
      return json(304, null, { ...cacheControl, etag });
    }
  }
  waitUntil(cache.put(new Request(keyUrl), response.clone()));
  return response;
}
