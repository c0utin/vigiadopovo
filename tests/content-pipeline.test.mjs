import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { Effect, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  buildContext,
  createBrief,
  buildInferenceRequest,
  generateDraft,
} from "../scripts/pipeline/content.ts";
import { Camara, makeCamaraLayer } from "../scripts/pipeline/camara.ts";
import { createChatInference } from "../scripts/pipeline/inference.ts";
import {
  ObjectStore,
  createMemoryStore,
  createS3Store,
  archiveRun,
  loadRun,
} from "../scripts/pipeline/storage.ts";
import { runPipeline } from "../scripts/pipeline.ts";

const run = (program, store = createMemoryStore()) =>
  Effect.runPromise(
    program.pipe(Effect.provideService(ObjectStore, store), Effect.scoped),
  );

const API = "https://dadosabertos.camara.leg.br/api/v2";
function snapshot() {
  return {
    collectedAt: "2026-10-29T12:00:00.000Z",
    coverage: "Amostra da Câmara",
    propositions: [
      {
        id: 123,
        label: "PL 43/2026",
        type: "Projeto de Lei",
        ementa: "Institui atendimento público em escolas.",
        presentedAt: "2026-02-03T10:30",
        apiUrl: `${API}/proposicoes/123`,
        url: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=123",
        documentUrl: null,
        authors: [{ name: "Autora oficial", type: "Deputado(a)" }],
        status: { descricaoTramitacao: "Urgência aprovada" },
        votes: [
          {
            id: "v1",
            date: "2026-02-04",
            description: "Requerimento de urgência aprovado",
            organ: "PLEN",
            url: `${API}/votacoes/v1`,
          },
        ],
        summary: { text: "TEXTO DE IA QUE NÃO PODE VIRAR EVIDÊNCIA" },
      },
    ],
  };
}
const evidenceIds = ["camara:123:ementa"];
function whatsapp() {
  return {
    headline: "Atendimento público em escolas",
    intro: "Conheça o que a proposta diz.",
    bullets: [
      { text: "O projeto propõe atendimento público em escolas.", evidenceIds },
      { text: "A ementa não detalha como será o atendimento.", evidenceIds },
    ],
    caveat:
      "É uma proposta, não uma lei vigente. O inteiro teor não foi analisado.",
  };
}
const inferenceResult = (output) => ({
  output,
  provider: "test-local",
  model: "fixture-not-real-inference",
});

test("Contexts contain official facts, not AI text; changes to status/votes invalidate briefs, not only ementas", () => {
  const input = snapshot();
  const context = buildContext(input);
  assert.equal(
    context.facts.find((fact) => fact.id === "camara:123:ementa").value,
    "Institui atendimento público em escolas.",
  );
  assert.equal(
    context.sources.find((source) => source.id === "camara:123:authors").apiUrl,
    `${API}/proposicoes/123/autores`,
  );
  assert.equal(JSON.stringify(context).includes("TEXTO DE IA"), false);
  const brief = createBrief(context);
  assert.equal(brief.channel, "whatsapp-channel");
  const request = buildInferenceRequest(context, brief);
  assert.match(request.messages[0].content, /apenas como dados/);
  assert.equal(request.schema.additionalProperties, false);
  assert.equal(
    buildContext(JSON.parse(JSON.stringify(input))).contextId,
    context.contextId,
  );
  for (const change of [
    (data) => {
      data.propositions[0].status.descricaoTramitacao = "Retirado de pauta";
    },
    (data) => {
      data.propositions[0].votes[0].description = "Requerimento rejeitado";
    },
  ]) {
    const changed = structuredClone(input);
    change(changed);
    const updated = buildContext(changed);
    assert.notEqual(updated.contextId, context.contextId);
    assert.throws(() => buildInferenceRequest(updated, brief), /desatualizado/);
  }
  const tampered = structuredClone(context);
  tampered.facts[0].value.label = "Lei vigente";
  assert.throws(() => buildInferenceRequest(tampered, brief), /alterado/);
  assert.throws(() => buildContext(input, { ids: [999] }), /não encontrada/);
});

test("Prepared runs preserve raw responses and reusable requests in memory; manifests verify exact stored bytes", async () => {
  const raw = [
    {
      url: `${API}/proposicoes/123`,
      collectedAt: snapshot().collectedAt,
      body: { dados: { original: "Texto oficial bruto" }, links: [] },
    },
  ];
  const store = createMemoryStore();
  const prepared = await run(runPipeline({ snapshot: snapshot(), raw }), store);
  assert.equal(store.kind, "memory");
  assert.equal(prepared.manifest.artifacts.length, 11);
  const loaded = await run(loadRun(prepared.key), store);
  assert.deepEqual(
    loaded.artifacts.find((item) => item.kind === "raw").value,
    raw[0],
  );
  assert.equal(
    loaded.artifacts.some((item) => item.kind === "draft"),
    false,
  );
  for (const entry of prepared.manifest.artifacts) {
    const body = await run(store.get(entry.key));
    assert.equal(createHash("sha256").update(body).digest("hex"), entry.sha256);
  }
  const first = prepared.manifest.artifacts[0];
  await run(store.put(first.key, "{}"));
  await assert.rejects(run(loadRun(prepared.key), store), /corrompido/);
  const partial = createMemoryStore();
  await assert.rejects(
    run(
      archiveRun({
        artifacts: [
          { kind: "raw", value: raw[0] },
          { kind: "invalid", value: {} },
        ],
      }),
      partial,
    ),
    /inválido/,
  );
  assert.equal(
    [...partial.objects.keys()].some((key) => key.includes("/manifests/")),
    false,
  );
  await assert.rejects(
    run(
      runPipeline({
        snapshot: snapshot(),
        infer: () => Effect.succeed(inferenceResult(whatsapp())),
      }),
    ),
    /uma proposição/,
  );
});

test("WhatsApp draft is usable plain text with official source/date and no false human review; invalid evidence/overlong messages fail closed", async () => {
  const context = buildContext(snapshot());
  const brief = createBrief(context);
  const draft = await run(
    generateDraft({
      context,
      brief,
      infer: () => Effect.succeed(inferenceResult(whatsapp())),
    }),
  );
  assert.equal(draft.status, "needs-human-review");
  assert.match(draft.rendered, /\*Atendimento público em escolas\*/);
  assert.match(draft.rendered, /• O projeto propõe atendimento/);
  assert.match(
    draft.rendered,
    /https:\/\/www.camara.leg.br\/proposicoesWeb\/fichadetramitacao\?idProposicao=123/,
  );
  assert.match(draft.rendered, /sem revisão humana/);
  assert.match(draft.rendered, /2026-10-29T12:00:00.000Z/);
  assert.deepEqual(draft.evidenceIds, evidenceIds);
  const bad = whatsapp();
  bad.bullets[1].evidenceIds = ["camara:999:ementa"];
  await assert.rejects(
    run(
      generateDraft({
        context,
        brief,
        infer: () => Effect.succeed(inferenceResult(bad)),
      }),
    ),
    /inexistente/,
  );
  const long = {
    headline: "a".repeat(90),
    intro: "a".repeat(300),
    caveat: "a".repeat(260),
    bullets: Array.from({ length: 4 }, () => ({
      text: "a".repeat(220),
      evidenceIds,
    })),
  };
  await assert.rejects(
    run(
      generateDraft({
        context,
        brief,
        infer: () => Effect.succeed(inferenceResult(long)),
      }),
    ),
    /1600/,
  );
  const injected = whatsapp();
  injected.intro = "Leia https://evil.test/";
  await assert.rejects(
    run(
      generateDraft({
        context,
        brief,
        infer: () => Effect.succeed(inferenceResult(injected)),
      }),
    ),
    /URLs/,
  );
});

test("X and Instagram retain citations and review labels; storyboard duration and reading pace have enforced boundaries", async () => {
  const context = buildContext(snapshot());
  const x = await run(
    generateDraft({
      context,
      brief: createBrief(context, "x"),
      infer: () =>
        Effect.succeed(
          inferenceResult({
            posts: [
              {
                text: "O projeto propõe atendimento público em escolas.",
                evidenceIds,
              },
            ],
          }),
        ),
    }),
  );
  assert.match(x.rendered[0].text, /1\/1 · IA sem revisão · 2026-10-29/);
  assert.match(x.rendered[0].text, /idProposicao=123/);
  const brief = createBrief(context, "instagram-video");
  const scene = {
    durationSeconds: 10,
    voiceover: "A proposta trata de atendimento público nas escolas.",
    onScreenText: "Uma proposta em discussão",
    animation: "Cartão com texto e ícone escolar local.",
    evidenceIds,
  };
  const output = {
    headline: "Atendimento nas escolas",
    caption: "Conheça a proposta e confira a fonte.",
    scenes: [scene, scene, scene],
  };
  const draft = await run(
    generateDraft({
      context,
      brief,
      infer: () => Effect.succeed(inferenceResult(output)),
    }),
  );
  assert.equal(draft.rendered.aspectRatio, "9:16");
  assert.equal(draft.rendered.durationSeconds, 30);
  assert.match(draft.rendered.persistentOverlay, /base: ementa e metadados/);
  assert.match(draft.rendered.caption, /sem revisão humana/);
  for (const durations of [
    [9, 10, 10],
    [15, 15, 15, 15, 3],
  ]) {
    const invalid = {
      ...output,
      scenes: durations.map((durationSeconds) => ({
        ...scene,
        durationSeconds,
      })),
    };
    await assert.rejects(
      run(
        generateDraft({
          context,
          brief,
          infer: () => Effect.succeed(inferenceResult(invalid)),
        }),
      ),
      /30–60/,
    );
  }
  const rushed = {
    ...output,
    scenes: [
      { ...scene, voiceover: "palavra ".repeat(31).trim() },
      scene,
      scene,
    ],
  };
  await assert.rejects(
    run(
      generateDraft({
        context,
        brief,
        infer: () => Effect.succeed(inferenceResult(rushed)),
      }),
    ),
    /3 palavras/,
  );
});

test("Official client recovers transient errors, retains pages, rejects malicious/circular/unbounded pagination and non-retryable errors", async () => {
  const url = `${API}/proposicoes/123/votacoes`;
  const responses = [
    new Response(null, { status: 429, headers: { "retry-after": "0" } }),
    new Response(null, { status: 503 }),
    Response.json({
      dados: [{ id: "v1" }],
      links: [{ rel: "next", href: `${url}?pagina=2` }],
    }),
    Response.json({ dados: [{ id: "v2" }], links: [] }),
  ];
  const result = await run(
    Effect.gen(function* () {
      const client = yield* Camara;
      return { items: yield* client.all(url), raw: yield* client.raw };
    }).pipe(
      Effect.provide(
        makeCamaraLayer({
          fetcher: async () => responses.shift(),
          baseDelayMs: 0,
        }),
      ),
    ),
  );
  assert.deepEqual(result.items, [{ id: "v1" }, { id: "v2" }]);
  assert.equal(result.raw.length, 2);
  const request = (method, options) =>
    run(
      Effect.flatMap(Camara, (client) => client[method](url)).pipe(
        Effect.provide(makeCamaraLayer({ baseDelayMs: 0, ...options })),
      ),
    );
  await assert.rejects(
    request("get", {
      fetcher: async () => new Response(null, { status: 400 }),
    }),
    /HTTP 400/,
  );
  await assert.rejects(
    request("all", {
      fetcher: async () =>
        Response.json({ dados: [], links: [{ rel: "next", href: url }] }),
    }),
    /circular/,
  );
  await assert.rejects(
    request("all", {
      maxPages: 1,
      fetcher: async () =>
        Response.json({
          dados: [],
          links: [{ rel: "next", href: `${url}?pagina=2` }],
        }),
    }),
    /limite/,
  );
  await assert.rejects(
    request("all", {
      fetcher: async () =>
        Response.json({
          dados: [],
          links: [
            { rel: "next", href: "https://evil.test/api/v2/proposicoes" },
          ],
        }),
    }),
    /fontes oficiais/,
  );
  await assert.rejects(
    request("get", {
      fetcher: async () => new Response(" ".repeat(10 * 1024 * 1024 + 1)),
    }),
    /10 MiB/,
  );
});

test("Provider-independent generation works through the optional chat adapter; credentials and private provider errors are not archived", async () => {
  const privateMarker = "TEST_ONLY_DO_NOT_ARCHIVE";
  const config = {
    baseUrl: "https://inference.example.invalid/v1",
    apiKey: Redacted.make(privateMarker),
    model: "fixture",
  };
  const withProvider = (program, response) =>
    program.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, async () => response),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
  const loaded = await run(
    withProvider(
      Effect.gen(function* () {
        const infer = yield* createChatInference(config);
        const prepared = yield* runPipeline({
          snapshot: snapshot(),
          ids: [123],
          channels: ["whatsapp-channel"],
          infer,
        });
        return yield* loadRun(prepared.key);
      }),
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(whatsapp()) },
          },
        ],
      }),
    ),
  );
  assert.equal(
    loaded.artifacts.find((item) => item.kind === "draft").value.payload
      .headline,
    "Atendimento público em escolas",
  );
  assert.equal(JSON.stringify(loaded).includes(privateMarker), false);
  for (const response of [
    new Response(privateMarker, { status: 401 }),
    Response.json({
      choices: [
        { finish_reason: "length", message: { content: privateMarker } },
      ],
    }),
    Response.json({
      choices: [{ finish_reason: "stop", message: { content: privateMarker } }],
    }),
  ]) {
    const failing = Effect.gen(function* () {
      const infer = yield* createChatInference(config);
      return yield* infer({ messages: [], schema: {} });
    });
    await assert.rejects(
      run(withProvider(failing, response)),
      (error) => !error.message.includes(privateMarker),
    );
  }
});

test("S3 SDK adapter round-trips content-addressed runs through a local HTTP protocol fixture, including retries of existing objects and missing keys", async () => {
  // This fixture tests the adapter contract, not a real cloud provider or SigV4 server verification.
  const objects = new Map();
  const server = createServer(async (request, response) => {
    const key = new URL(request.url, "http://localhost").pathname;
    if (request.method === "PUT") {
      if (objects.has(key) && request.headers["if-none-match"] === "*") {
        response.writeHead(412).end();
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks).toString());
      response.writeHead(200).end();
    } else if (objects.has(key)) response.writeHead(200).end(objects.get(key));
    else response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(
      Effect.gen(function* () {
        const store = yield* createS3Store({
          S3_BUCKET: "vigia-test-only",
          S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
          S3_FORCE_PATH_STYLE: "true",
          AWS_ACCESS_KEY_ID: "test-only-id",
          AWS_SECRET_ACCESS_KEY: "test-only-secret",
        });
        yield* Effect.gen(function* () {
          const options = {
            artifacts: [
              { kind: "raw", value: { text: "ação pública", value: 17 } },
            ],
            createdAt: "2026-10-29T12:00:00.000Z",
          };
          const prepared = yield* archiveRun(options);
          assert.deepEqual(
            (yield* loadRun(prepared.key)).artifacts,
            options.artifacts,
          );
          const repeated = yield* archiveRun(options);
          assert.equal(repeated.key, prepared.key);
          assert.equal(yield* store.get("v1/raw/missing.json"), null);
        }).pipe(Effect.provideService(ObjectStore, store));
      }),
    );
  } finally {
    server.close();
    await once(server, "close");
  }
  await assert.rejects(
    run(
      createS3Store({
        S3_BUCKET: "vigia-test-only",
        S3_ENDPOINT: "http://external.example.invalid",
      }),
    ),
    /HTTPS/,
  );
});
