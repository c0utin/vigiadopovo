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
import { createHash } from "node:crypto";
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
const BulkUrl = OfficialUrl.check(
  Schema.makeFilter((url) =>
    url.origin === "https://dadosabertos.camara.leg.br" &&
    /^\/arquivos\/[A-Za-z]+\/json\/[A-Za-z0-9-]+\.json$/.test(url.pathname) &&
    !url.search
      ? true
      : "URL fora dos arquivos de dados abertos da Câmara",
  ),
);
const PhotoUrl = OfficialUrl.check(
  Schema.makeFilter((url) =>
    url.origin === "https://www.camara.leg.br" &&
    /^\/internet\/deputado\/bandep\/\d+\.jpg$/.test(url.pathname)
      ? true
      : "URL fora das fotos oficiais",
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

export type BulkFile = {
  url: string;
  collectedAt: string;
  sha256: string;
  bytes: number;
  dados: unknown;
};

export class Camara extends Context.Service<
  Camara,
  {
    get(url: string): Effect.Effect<typeof Envelope.Type, SourceError>;
    all(url: string): Effect.Effect<readonly unknown[], SourceError>;
    file(url: string): Effect.Effect<BulkFile, SourceError>;
    photo(id: number): Effect.Effect<Buffer, SourceError>;
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
      // One bounded, retried and cancellable download path for every source.
      const download = (
        url: URL,
        {
          accept,
          maxBytes,
          timeout,
        }: { accept: string; maxBytes: number; timeout: number },
      ) =>
        Effect.gen(function* () {
          const response = yield* http.get(url.href, {
            headers: { Accept: accept },
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
              if (size > maxBytes)
                return Effect.fail(
                  new SourceError({
                    message: `Resposta da Câmara excedeu ${maxBytes / 1024 / 1024} MiB`,
                    retryable: false,
                    retryAfterMillis: null,
                  }),
                );
              state.chunks.push(chunk);
              return Effect.succeed({ size, chunks: state.chunks });
            },
          );
          return {
            contentType: response.headers["content-type"] ?? "",
            body: Buffer.concat(bytes.chunks),
          };
        }).pipe(
          Effect.timeoutOrElse({
            duration: timeout,
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
          Effect.scoped,
          Effect.retry(retry),
        );
      const decodeEnvelope = (body: Buffer) =>
        Schema.decodeUnknownEffect(Schema.fromJsonString(Envelope))(
          body.toString("utf8"),
        ).pipe(
          Effect.mapError(
            () =>
              new SourceError({
                message: "Resposta da Câmara inválida",
                retryable: false,
                retryAfterMillis: null,
              }),
          ),
        );
      const parse = <S extends Schema.Top>(schema: S, input: string) =>
        Schema.decodeUnknownEffect(schema)(input).pipe(
          Effect.mapError(
            () =>
              new SourceError({
                message: "URL fora das fontes oficiais da API",
                retryable: false,
                retryAfterMillis: null,
              }),
          ),
        );
      const get = Effect.fn("Camara.get")(function* (input: string) {
        const url = yield* parse(ApiUrl, input);
        const { body } = yield* download(url, {
          accept: "application/json",
          maxBytes: 10 * 1024 * 1024,
          timeout: timeoutMs,
        });
        const envelope = yield* decodeEnvelope(body);
        const collectedAt = DateTime.formatIso(yield* DateTime.now);
        yield* Ref.update(raw, (responses) => [
          ...responses,
          {
            url: url.href,
            collectedAt,
            body: JSON.parse(body.toString("utf8")),
          },
        ]);
        return envelope;
      });
      // Daily bulk exports: too large to archive per request, so callers get
      // the digest of the exact bytes instead of a raw capture.
      const file = Effect.fn("Camara.file")(function* (input: string) {
        const url = yield* parse(BulkUrl, input);
        const { body } = yield* download(url, {
          accept: "application/json",
          maxBytes: 128 * 1024 * 1024,
          timeout: Math.max(timeoutMs, 120000),
        });
        const envelope = yield* decodeEnvelope(body);
        return {
          url: url.href,
          collectedAt: DateTime.formatIso(yield* DateTime.now),
          sha256: createHash("sha256").update(body).digest("hex"),
          bytes: body.byteLength,
          dados: envelope.dados,
        };
      });
      const photo = Effect.fn("Camara.photo")(function* (id: number) {
        const url = yield* parse(
          PhotoUrl,
          `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`,
        );
        const { body, contentType } = yield* download(url, {
          accept: "image/jpeg",
          maxBytes: 1024 * 1024,
          timeout: timeoutMs,
        });
        // Only real JPEGs are republished; anything else is rejected.
        if (
          !contentType.startsWith("image/jpeg") ||
          body[0] !== 0xff ||
          body[1] !== 0xd8 ||
          body[2] !== 0xff
        )
          return yield* new SourceError({
            message: "Foto oficial em formato inesperado",
            retryable: false,
            retryAfterMillis: null,
          });
        return body;
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
      return Camara.of({ get, all, file, photo, raw: Ref.get(raw) });
    }),
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetcher)),
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
  );
}
