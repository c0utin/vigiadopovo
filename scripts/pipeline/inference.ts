import { Config, Effect, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { PipelineError } from "./errors.ts";
import type { Infer } from "./content.ts";

const Endpoint = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
      ? true
      : "Endpoint de IA inválido",
  ),
);
const Completion = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      finish_reason: Schema.String,
      message: Schema.Struct({
        content: Schema.NullOr(Schema.String),
        refusal: Schema.optionalKey(Schema.NullOr(Schema.String)),
      }),
    }),
  ).check(Schema.isMinLength(1)),
});

// HTTP transport is injected by Layer. This adapter implements a public protocol,
// not a dependency on any particular model/provider. Inference is never retried.
export const createChatInference = Effect.fn("createChatInference")(function* ({
  baseUrl,
  apiKey,
  model,
}: {
  baseUrl: string;
  apiKey: Redacted.Redacted<string>;
  model: string;
}) {
  const endpoint = yield* Schema.decodeUnknownEffect(Endpoint)(baseUrl).pipe(
    Effect.mapError(
      () =>
        new PipelineError({
          stage: "inference",
          message:
            "AI_BASE_URL deve usar HTTPS sem credenciais ou query string",
        }),
    ),
  );
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/chat/completions`;
  const http = HttpClient.withScope(yield* HttpClient.HttpClient);
  const infer: Infer = Effect.fn("infer")(
    function* (request) {
      const response = yield* HttpClientRequest.post(endpoint.href).pipe(
        HttpClientRequest.bearerToken(apiKey),
        HttpClientRequest.bodyJsonUnsafe({
          model,
          messages: request.messages,
          max_completion_tokens: 2400,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "legislative_draft",
              strict: true,
              schema: request.schema,
            },
          },
        }),
        http.execute,
      );
      if (response.status < 200 || response.status >= 300)
        return yield* new PipelineError({
          stage: "inference",
          message: `Inferência retornou HTTP ${response.status}; resposta privada omitida`,
        });
      const body = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Completion)),
      );
      const choice = body.choices[0];
      if (
        choice.finish_reason !== "stop" ||
        choice.message.refusal ||
        !choice.message.content
      )
        return yield* new PipelineError({
          stage: "inference",
          message: "Inferência recusada, truncada ou vazia",
        });
      const output = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(choice.message.content);
      return { output, provider: endpoint.hostname, model };
    },
    Effect.timeout("90 seconds"),
    Effect.catchTags({
      HttpClientError: () =>
        Effect.fail(
          new PipelineError({
            stage: "inference",
            message: "Falha de conexão com a IA; detalhes privados omitidos",
          }),
        ),
      SchemaError: () =>
        Effect.fail(
          new PipelineError({
            stage: "inference",
            message: "Resposta de IA inválida; detalhes privados omitidos",
          }),
        ),
      TimeoutError: () =>
        Effect.fail(
          new PipelineError({
            stage: "inference",
            message:
              "Timeout na IA; confirme a cobrança antes de tentar novamente",
          }),
        ),
    }),
    Effect.scoped,
  );
  return infer;
});

export const inferenceFromEnv = Config.all({
  baseUrl: Config.NonEmptyString("AI_BASE_URL"),
  apiKey: Config.Redacted("AI_API_KEY"),
  model: Config.NonEmptyString("AI_MODEL"),
}).pipe(
  Effect.flatMap(createChatInference),
  Effect.mapError(
    () =>
      new PipelineError({
        stage: "inference",
        message:
          "Configure AI_BASE_URL, AI_MODEL e AI_API_KEY no ambiente privado",
      }),
  ),
);
