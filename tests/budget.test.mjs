import { test } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { FREE, usage, violations } from "../scripts/budget.ts";

const CREDENTIALS = { accountId: "a", token: "t" };
const NOW = new Date("2026-11-05T12:00:00Z");

// Answers every request with the given status and JSON body.
const analytics = (body, status = 200) =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(request, Response.json(body, { status })),
    ),
  );

const run = (body, status) =>
  usage(CREDENTIALS, NOW).pipe(
    Effect.provideService(HttpClient.HttpClient, analytics(body, status)),
    Effect.runPromise,
  );

const account = {
  operations: [
    { sum: { requests: 5 }, dimensions: { actionType: "GetObject" } },
    { sum: { requests: 7 }, dimensions: { actionType: "PutObject" } },
    // Unknown operations count as Class A; deletes are free.
    { sum: { requests: 2 }, dimensions: { actionType: "NewThing" } },
    { sum: { requests: 9 }, dimensions: { actionType: "DeleteObject" } },
  ],
  storage: [
    { max: { payloadSize: 100, metadataSize: 1 } },
    { max: { payloadSize: 50, metadataSize: 0 } },
  ],
  catalog: [{ count: 4 }],
};

test("budget counts conservatively and refuses work past 80%", async () => {
  const current = await run({
    data: { viewer: { accounts: [account] } },
    errors: null,
  });
  assert.deepEqual(current, {
    storage: 151,
    classA: 9,
    classB: 5,
    catalogOps: 4,
  });
  assert.deepEqual(violations(current), []);

  // Planned work is refused exactly at the 80% line, not one unit before.
  const nearly = { ...current, classA: FREE.classA * 0.8 - 9 };
  assert.deepEqual(violations(nearly, { classA: 8 }), []);
  assert.equal(violations(nearly, { classA: 9 }).length, 1);
});

test("no analytics means no spending", async () => {
  const failures = [
    await Effect.runPromise(
      Effect.flip(
        usage(CREDENTIALS, NOW).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            analytics({ errors: [{ message: "x" }] }),
          ),
        ),
      ),
    ),
    await Effect.runPromise(
      Effect.flip(
        usage(CREDENTIALS, NOW).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            analytics({ data: { viewer: { accounts: [account] } } }, 500),
          ),
        ),
      ),
    ),
    await Effect.runPromise(
      Effect.flip(
        usage(CREDENTIALS, NOW).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            analytics({ data: { viewer: { accounts: [] } } }),
          ),
        ),
      ),
    ),
  ];
  for (const error of failures) assert.equal(error._tag, "BudgetError");
});
