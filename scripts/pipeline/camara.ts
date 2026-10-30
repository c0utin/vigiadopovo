import {
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Ref,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { SourceError } from "./errors.ts";

const OfficialUrl = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    [
      "camara.leg.br",
      "www.camara.leg.br",
      "dadosabertos.camara.leg.br",
      "www2.camara.leg.br",
    ].includes(url.hostname)
      ? true
      : "URL fora das fontes oficiais permitidas",
  ),
);
export function officialUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return Schema.decodeUnknownSync(OfficialUrl)(value).href;
}
export const OfficialUrlString = Schema.String.check(
  Schema.makeFilter((value) =>
    Option.isSome(Schema.decodeUnknownOption(OfficialUrl)(value))
      ? true
      : "Fonte não oficial",
  ),
);
const ApiUrl = OfficialUrl.check(
  Schema.makeFilter((url) =>
    url.origin === "https://dadosabertos.camara.leg.br" &&
    url.pathname.startsWith("/api/v2/")
      ? true
      : "URL fora da API da Câmara",
  ),
);
const Envelope = Schema.Struct({
  dados: Schema.Unknown,
  links: Schema.optionalKey(
    Schema.Array(Schema.Struct({ rel: Schema.String, href: Schema.String })),
  ),
});
export type RawResponse = {
  url: string;
  collectedAt: string;
  body: unknown;
  redactions?: readonly string[];
};

export class Camara extends Context.Service<
  Camara,
  {
    get(url: string): Effect.Effect<typeof Envelope.Type, SourceError>;
    all(url: string): Effect.Effect<readonly unknown[], SourceError>;
    raw: Effect.Effect<readonly RawResponse[]>;
  }
>()("vigia/pipeline/Camara") {}

export function makeCamaraLayer({
  fetcher = globalThis.fetch,
  maxPages = 100,
  timeoutMs = 30000,
  baseDelayMs = 500,
}: {
  fetcher?: typeof fetch;
  maxPages?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
} = {}) {
  return Layer.effect(
    Camara,
    Effect.gen(function* () {
      const http = HttpClient.withScope(yield* HttpClient.HttpClient);
      const raw = yield* Ref.make<readonly RawResponse[]>([]);
      const retry = Schedule.exponential(baseDelayMs).pipe(
        Schedule.jittered,
        Schedule.setInputType<SourceError>(),
        Schedule.modifyDelay(({ input, duration }) =>
          Effect.succeed(input.retryAfterMillis ?? duration),
        ),
        Schedule.upTo({ times: 2 }),
        Schedule.while(({ input }) => input.retryable),
      );
      const get = Effect.fn("Camara.get")(function* (input: string) {
        const url = yield* Schema.decodeUnknownEffect(ApiUrl)(input).pipe(
          Effect.mapError(
            () =>
              new SourceError({
                message: "URL fora das fontes oficiais da API",
                retryable: false,
                retryAfterMillis: null,
              }),
          ),
        );
        const attempt = Effect.gen(function* () {
          const response = yield* http.get(url.href, {
            headers: { Accept: "application/json" },
          });
          if (response.status < 200 || response.status >= 300) {
            const header = response.headers["retry-after"];
            const seconds = Option.getOrUndefined(
              Schema.decodeUnknownOption(
                Schema.NumberFromString.check(
                  Schema.isInt(),
                  Schema.isGreaterThanOrEqualTo(0),
                ),
              )(header),
            );
            const date = Option.getOrUndefined(
              Schema.decodeUnknownOption(Schema.DateTimeUtcFromHttpDate)(
                header,
              ),
            );
            const now = yield* DateTime.now;
            const wait =
              seconds !== undefined
                ? seconds * 1000
                : date
                  ? Math.max(
                      0,
                      DateTime.toEpochMillis(date) -
                        DateTime.toEpochMillis(now),
                    )
                  : null;
            return yield* new SourceError({
              message: `Câmara retornou HTTP ${response.status}`,
              retryable:
                (wait === null || wait <= 30000) &&
                (response.status === 408 ||
                  response.status === 429 ||
                  response.status >= 500),
              retryAfterMillis: wait,
            });
          }
          const bytes = yield* Stream.runFoldEffect(
            response.stream,
            () => ({ size: 0, chunks: [] as Uint8Array[] }),
            (state, chunk) => {
              const size = state.size + chunk.byteLength;
              return size > 10 * 1024 * 1024
                ? Effect.fail(
                    new SourceError({
                      message: "Resposta da Câmara excedeu 10 MiB",
                      retryable: false,
                      retryAfterMillis: null,
                    }),
                  )
                : Effect.succeed({ size, chunks: [...state.chunks, chunk] });
            },
          );
          const body = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Unknown),
          )(Buffer.concat(bytes.chunks).toString("utf8"));
          const envelope = yield* Schema.decodeUnknownEffect(Envelope)(body);
          const collectedAt = DateTime.formatIso(yield* DateTime.now);
          yield* Ref.update(raw, (responses) => [
            ...responses,
            { url: url.href, collectedAt, body },
          ]);
          return envelope;
        }).pipe(
          Effect.timeoutOrElse({
            duration: timeoutMs,
            orElse: () =>
              Effect.fail(
                new SourceError({
                  message: "Timeout na Câmara",
                  retryable: true,
                  retryAfterMillis: null,
                }),
              ),
          }),
          Effect.catchTag("HttpClientError", (error) =>
            Effect.fail(
              new SourceError({
                message: "Falha de conexão/leitura da Câmara",
                retryable: error.reason._tag !== "EncodeError",
                retryAfterMillis: null,
              }),
            ),
          ),
          Effect.catchTag("SchemaError", () =>
            Effect.fail(
              new SourceError({
                message: "Resposta da Câmara inválida",
                retryable: false,
                retryAfterMillis: null,
              }),
            ),
          ),
          Effect.scoped,
        );
        return yield* attempt.pipe(Effect.retry(retry));
      });
      const all = Effect.fn("Camara.all")(function* (input: string) {
        const items: unknown[] = [];
        const seen = new Set<string>();
        let next: string | undefined = input;
        while (next) {
          if (seen.has(next) || seen.size >= maxPages)
            return yield* new SourceError({
              message: "Paginação circular ou limite de páginas excedido",
              retryable: false,
              retryAfterMillis: null,
            });
          seen.add(next);
          const page: typeof Envelope.Type = yield* get(next);
          const dados = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Unknown),
          )(page.dados).pipe(
            Effect.mapError(
              () =>
                new SourceError({
                  message: "Lista da Câmara inválida",
                  retryable: false,
                  retryAfterMillis: null,
                }),
            ),
          );
          items.push(...dados);
          next = page.links?.find((link) => link.rel === "next")?.href;
        }
        return items;
      });
      return Camara.of({ get, all, raw: Ref.get(raw) });
    }),
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetcher)),
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
  );
}
