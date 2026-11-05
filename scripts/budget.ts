// Monthly free-tier guard for everything this project can be billed for: R2
// (on pay-as-you-go, so overage is charged, not refused), R2 SQL and the R2
// Data Catalog. Reads this month's real usage from Cloudflare's GraphQL
// Analytics and refuses work that would pass SAFETY of any free allowance.
//
//   pnpm budget       # prints usage; exits 1 at or over the threshold
//
// Workers are on the Free plan: past 100k requests/day they return errors
// instead of billing. That cap also bounds the Worker's R2 reads (at most one
// per request, so at most ~3.1M a month against 10M free).
//
// Counts are conservative: unknown R2 operations are counted as Class A, every
// R2 SQL query is counted as its bytes PLUS the 10 MB per-query minimum, and
// storage is the month's maximum. Analytics lag a few minutes, which the
// safety margin covers. Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
// with Account Analytics read.
import { pathToFileURL } from "node:url";

export const SAFETY = 0.8;
// Decimal GB, below the binary GB Cloudflare bills by: stricter.
const GB = 1e9;
export const SQL_MINIMUM = 10e6;
export const FREE = {
  storage: 10 * GB,
  classA: 1_000_000,
  classB: 10_000_000,
  sqlScanned: 10 * GB,
  catalogOps: 1_000_000,
} as const;
export type Usage = Record<keyof typeof FREE, number>;

const LABELS: Record<keyof typeof FREE, string> = {
  storage: "R2 armazenamento (bytes)",
  classA: "R2 operações Classe A",
  classB: "R2 operações Classe B",
  sqlScanned: "R2 SQL dados lidos (bytes)",
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
    sql: r2sqlOperationsAdaptiveGroups(limit: 1000, filter: { date_geq: $startDate, date_leq: $endDate }) {
      count sum { r2BytesRead }
    }
    catalog: r2CatalogDataOperationsAdaptiveGroups(limit: 1000, filter: { date_geq: $startDate, date_leq: $endDate }) {
      count
    }
  } }
}`;

export async function usage(
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<Usage> {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = env;
  if (!account || !token)
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN são exigidos",
    );
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const response = await fetcher(
    "https://api.cloudflare.com/client/v4/graphql",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          account,
          start: start.toISOString(),
          end: now.toISOString(),
          startDate: start.toISOString().slice(0, 10),
          endDate: now.toISOString().slice(0, 10),
        },
      }),
    },
  );
  const body: any = await response.json().catch(() => null);
  const data = body?.data?.viewer?.accounts?.[0];
  // Fail closed: without usage numbers nothing may spend.
  if (!response.ok || body?.errors?.length || !data)
    throw new Error(
      `Analytics indisponível (${response.status}); nada foi executado`,
    );
  const result: Usage = {
    storage: 0,
    classA: 0,
    classB: 0,
    sqlScanned: 0,
    catalogOps: 0,
  };
  for (const { sum, dimensions } of data.operations) {
    if (FREE_OPERATIONS.has(dimensions.actionType)) continue;
    result[CLASS_B.has(dimensions.actionType) ? "classB" : "classA"] +=
      sum.requests;
  }
  for (const { max } of data.storage)
    result.storage += max.payloadSize + max.metadataSize;
  for (const { count, sum } of data.sql)
    result.sqlScanned += sum.r2BytesRead + count * SQL_MINIMUM;
  for (const { count } of data.catalog) result.catalogOps += count;
  return result;
}

// Allowances that `current` plus `planned` would put at or over SAFETY.
export function violations(current: Usage, planned: Partial<Usage> = {}) {
  return (Object.keys(FREE) as (keyof typeof FREE)[])
    .filter((key) => current[key] + (planned[key] ?? 0) >= FREE[key] * SAFETY)
    .map(
      (key) =>
        `${LABELS[key]}: ${current[key] + (planned[key] ?? 0)} de ${FREE[key]} grátis (limite de segurança ${SAFETY * 100}%)`,
    );
}

export function report(current: Usage) {
  return (Object.keys(FREE) as (keyof typeof FREE)[])
    .map(
      (key) =>
        `${LABELS[key].padEnd(30)} ${String(current[key]).padStart(14)} ${((current[key] / FREE[key]) * 100).toFixed(2).padStart(7)}%`,
    )
    .join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  usage()
    .then((current) => {
      console.log(report(current));
      const over = violations(current);
      if (over.length) {
        console.error(`Orçamento grátis no limite:\n${over.join("\n")}`);
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(String(error?.message ?? error));
      process.exitCode = 1;
    });
