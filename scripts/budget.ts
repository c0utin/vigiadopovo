// Monthly free-tier guard for R2 (storage and operations) and the R2 Data
// Catalog. Reads this month's usage from Cloudflare's GraphQL Analytics and
// fails when any allowance reaches SAFETY. Fail-closed: without analytics
// nothing may run.
//
//   pnpm budget       # prints usage; fails at or over the threshold
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics read).
import { NodeRuntime } from "@effect/platform-node";
import { Clock, Config, Console, Effect, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import { pathToFileURL } from "node:url";

class BudgetError extends Schema.TaggedError<BudgetError>()("BudgetError", {
  message: Schema.String,
}) {}

const SAFETY = 0.8;
// Decimal GB, below the binary GB Cloudflare bills by: stricter.
const GB = 1e9;
export const FREE = {
  storage: 10 * GB,
  classA: 1_000_000,
  classB: 10_000_000,
  catalogOps: 1_000_000,
} as const;
const KEYS = Object.keys(FREE) as (keyof typeof FREE)[];
type Usage = Record<keyof typeof FREE, number>;

const LABELS: Record<keyof typeof FREE, string> = {
  storage: "R2 armazenamento (bytes)",
  classA: "R2 operações Classe A",
  classB: "R2 operações Classe B",
  catalogOps: "R2 Data Catalog operações",
};

const CLASS_B = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);
const FREE_OPERATIONS = new Set([
  "DeleteObject",
  "DeleteObjects",
  "DeleteBucket",
  "AbortMultipartUpload",
]);

const QUERY = `query ($account: String!, $start: Time!, $end: Time!, $startDate: Date!, $endDate: Date!) {
  viewer { accounts(filter: { accountTag: $account }) {
    operations: r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end }) {
      sum { requests } dimensions { actionType }
    }
    storage: r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
      max { payloadSize metadataSize } dimensions { bucketName }
    }
    catalog: r2CatalogDataOperationsAdaptiveGroups(limit: 1000, filter: { date_geq: $startDate, date_leq: $endDate }) {
      count
    }
  } }
}`;

const Analytics = Schema.Struct({
  // Cloudflare sends `errors: null` when the query succeeds.
  errors: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Unknown))),
  data: Schema.Struct({
    viewer: Schema.Struct({
      accounts: Schema.Array(
        Schema.Struct({
          operations: Schema.Array(
            Schema.Struct({
              sum: Schema.Struct({ requests: Schema.Number }),
              dimensions: Schema.Struct({ actionType: Schema.String }),
            }),
          ),
          storage: Schema.Array(
            Schema.Struct({
              max: Schema.Struct({
                payloadSize: Schema.Number,
                metadataSize: Schema.Number,
              }),
            }),
          ),
          catalog: Schema.Array(Schema.Struct({ count: Schema.Number })),
        }),
      ),
    }),
  }),
});

export const usage = Effect.fn("usage")(function* (
  credentials: { accountId: string; token: string },
  now: Date,
) {
  const client = yield* HttpClient.HttpClient;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const request = HttpClientRequest.post(
    "https://api.cloudflare.com/client/v4/graphql",
  ).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${credentials.token}`),
    HttpClientRequest.bodyJsonUnsafe({
      query: QUERY,
      variables: {
        account: credentials.accountId,
        start: start.toISOString(),
        end: now.toISOString(),
        startDate: start.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      },
    }),
  );
  const body = yield* client.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(Analytics)),
    Effect.mapError(
      () =>
        new BudgetError({
          message: "Analytics indisponível; nada foi executado",
        }),
    ),
  );
  const [account] = body.data.viewer.accounts;
  if (body.errors?.length || !account)
    return yield* new BudgetError({
      message: "Analytics indisponível; nada foi executado",
    });
  const result: Usage = { storage: 0, classA: 0, classB: 0, catalogOps: 0 };
  for (const { sum, dimensions } of account.operations) {
    if (FREE_OPERATIONS.has(dimensions.actionType)) continue;
    result[CLASS_B.has(dimensions.actionType) ? "classB" : "classA"] +=
      sum.requests;
  }
  for (const { max } of account.storage)
    result.storage += max.payloadSize + max.metadataSize;
  for (const { count } of account.catalog) result.catalogOps += count;
  return result;
});

// Allowances that `current` plus `planned` would put at or over SAFETY.
export function violations(current: Usage, planned: Partial<Usage> = {}) {
  return KEYS.filter(
    (key) => current[key] + (planned[key] ?? 0) >= FREE[key] * SAFETY,
  ).map(
    (key) =>
      `${LABELS[key]}: ${current[key] + (planned[key] ?? 0)} de ${FREE[key]} grátis (limite de segurança ${SAFETY * 100}%)`,
  );
}

function report(current: Usage) {
  return KEYS.map(
    (key) =>
      `${LABELS[key].padEnd(30)} ${String(current[key]).padStart(14)} ${((current[key] / FREE[key]) * 100).toFixed(2).padStart(7)}%`,
  ).join("\n");
}

const budget = Effect.gen(function* () {
  const { accountId, token } = yield* Config.all({
    accountId: Config.String("CLOUDFLARE_ACCOUNT_ID"),
    token: Config.String("CLOUDFLARE_API_TOKEN"),
  });
  const current = yield* usage(
    { accountId, token },
    new Date(yield* Clock.currentTimeMillis),
  );
  yield* Console.log(report(current));
  const over = violations(current);
  if (over.length)
    return yield* new BudgetError({
      message: `Orçamento grátis no limite:\n${over.join("\n")}`,
    });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  budget.pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain);
