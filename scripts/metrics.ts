// Publishes the Worker's metrics: reads the gold layer of the lake (ouro.*,
// written by lake/) with R2 SQL and stores it as JSON in the media bucket, so
// visitors never trigger a query.
//
//   pnpm data:metrics             # years whose latest batch changed
//   pnpm data:metrics 2019 2020   # also force these years
//
// A year's fingerprint is its latest complete batch (`lote` in
// bronze.arquivos, the SHA-256 of its four official files). Only years whose
// batch differs from the published index are read again: normally the current
// year, at 1 + 3 small queries a day. Every query is checked against the
// monthly free-tier budget (scripts/budget.ts) before it runs. Files are
// written before metricas/v1/indice.json.
//
// Env: CLOUDFLARE_ACCOUNT_ID, LAKE_TOKEN (R2 SQL read), CLOUDFLARE_API_TOKEN
// (analytics, and media bucket read/write through wrangler), optional
// MEDIA_BUCKET and LAKE_BUCKET.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { SQL_MINIMUM, report, usage, violations } from "./budget.ts";
import {
  BLOCS,
  FIRST_YEAR,
  PREFIX,
  currentYear,
} from "../worker/definitions.ts";

type Row = Record<string, string | number | null>;

const env = process.env;
const lake = env.LAKE_BUCKET || "vigia-lake";
const media = env.MEDIA_BUCKET || "vigia-media";
for (const name of [
  "CLOUDFLARE_ACCOUNT_ID",
  "LAKE_TOKEN",
  "CLOUDFLARE_API_TOKEN",
])
  if (!env[name]) throw new Error(`${name} não configurado`);

// The media bucket is read and written with wrangler (`pnpm data:metrics`
// puts node_modules/.bin on PATH).
const run = promisify(execFile);
const r2 = (args: string[], input?: string) => {
  const child = run("wrangler", ["r2", "object", ...args, "--remote"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (input !== undefined) child.child.stdin!.end(input);
  return child;
};

// Bytes billed by this run so far, on top of the month's usage.
let spent = 0;
const month = await usage();
console.log(report(month));

async function sql(query: string) {
  const over = violations(month, { sqlScanned: spent + SQL_MINIMUM });
  if (over.length) throw new Error(`Consulta recusada:\n${over.join("\n")}`);
  const response = await fetch(
    `https://api.sql.cloudflarestorage.com/api/v1/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/basin-sql/query/${lake}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.LAKE_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const body: any = await response.json().catch(() => null);
  // A failed query may still have scanned data: count the minimum.
  spent += Math.max(SQL_MINIMUM, body?.result?.metrics?.bytes_scanned ?? 0);
  if (!response.ok || !body?.success)
    throw new Error(
      `R2 SQL ${response.status}: ${(body?.errors ?? []).map((e: any) => `[${e.code}] ${e.message}`).join("; ")}`,
    );
  return body.result.rows as Row[];
}

async function read(key: string) {
  try {
    const { stdout } = await r2(["get", `${media}/${key}`, "--pipe"]);
    return JSON.parse(stdout);
  } catch (error: any) {
    if (/specified key does not exist/.test(error?.stderr ?? "")) return null;
    throw error;
  }
}

const write = (key: string, value: unknown) =>
  r2(
    [
      "put",
      `${media}/${key}`,
      "--pipe",
      "--content-type",
      "application/json; charset=utf-8",
    ],
    JSON.stringify(value),
  );

async function compute(
  ano: number,
  lote: string,
  sources: Row[],
  calculado_em: string,
) {
  // lote comes from the lake; only a SHA-256 hex string is put in SQL.
  if (!/^[0-9a-f]{64}$/.test(lote)) throw new Error(`Lote inválido em ${ano}`);
  const where = `WHERE ano = ${ano} AND lote = '${lote}'`;
  const [alignment, deputies, votings] = [
    await sql(`SELECT bloco, partido, votos, alinhados
FROM ouro.alinhamento_bancada ${where}
ORDER BY bloco, votos DESC, partido
LIMIT 2000`),
    await sql(`SELECT deputado_id AS deputado, orgao, voto, votos, com_orientacao_governo, alinhados_governo
FROM ouro.deputado_votos ${where}
ORDER BY deputado, votos DESC, orgao, voto
LIMIT 50000`),
    await sql(`SELECT mes, votacoes, nominais, plenario
FROM ouro.votacoes_mes ${where}
ORDER BY mes
LIMIT 13`),
  ];
  // LIMITs are far above real sizes; reaching one means silently cut data.
  if (alignment.length >= 2000 || deputies.length >= 50000)
    throw new Error(`Resultado truncado em ${ano}`);

  const bancadas = Object.fromEntries(BLOCS.map((b) => [b, [] as Row[]]));
  for (const { bloco, ...row } of alignment)
    bancadas[bloco as string]?.push(row);
  const byDeputy: Record<string, Row[]> = {};
  for (const { deputado, ...row } of deputies)
    (byDeputy[deputado as number] ??= []).push(row);

  const base = `${PREFIX}/${ano}`;
  await write(`${base}/alinhamento.json`, { ano, calculado_em, bancadas });
  await write(`${base}/deputados.json`, {
    ano,
    calculado_em,
    deputados: byDeputy,
  });
  await write(`${base}/votacoes.json`, { ano, calculado_em, linhas: votings });
  await write(`${base}/fontes.json`, { ano, calculado_em, linhas: sources });
  console.log(
    `${ano}: ${Object.keys(byDeputy).length} deputados, ${alignment.length} linhas de alinhamento, ${votings.length} meses`,
  );
}

const last = currentYear();
const forced = process.argv
  .slice(2)
  .map(Number)
  .filter((y) => Number.isInteger(y) && y >= FIRST_YEAR && y <= last);

// One row per file per batch; the lake writes bronze.arquivos last, so a
// batch listed there is complete. A year's current batch is its latest one.
const files =
  await sql(`SELECT ano, lote, arquivo, url, sha256, bytes, objeto, coletado_em
FROM bronze.arquivos
ORDER BY ano, coletado_em, arquivo
LIMIT 100000`);
if (files.length >= 100000) throw new Error("bronze.arquivos truncado");
const byYear = new Map<number, Row[]>();
for (const row of files) {
  const ano = row.ano as number;
  const latest = byYear.get(ano)?.[0]?.coletado_em;
  if (latest !== row.coletado_em) byYear.set(ano, []);
  byYear.get(ano)!.push(row);
}
// The batch hashes the same "arquivo:sha256" lines: recomputing it checks
// that the four rows are the batch they claim to be.
const fingerprint = (rows: Row[]) => {
  const print = createHash("sha256")
    .update(
      rows
        .map((r) => `${r.arquivo}:${r.sha256}`)
        .sort()
        .join("\n"),
    )
    .digest("hex");
  return rows.length === 4 && print === rows[0].lote ? print : null;
};

const index = (await read(`${PREFIX}/indice.json`)) ?? { anos: {} };
// Newest first, so a tight budget still updates the current year.
const pending = [...byYear.keys()]
  .sort((a, b) => b - a)
  .filter((ano) => {
    const print = fingerprint(byYear.get(ano)!);
    return (
      print && (forced.includes(ano) || index.anos[ano]?.fingerprint !== print)
    );
  });
console.log(
  pending.length
    ? `Recalculando: ${pending.join(", ")}`
    : "Nenhum ano com fontes novas; nada a recalcular.",
);

const calculado_em = new Date().toISOString();
let failure;
for (const ano of pending) {
  try {
    const rows = byYear.get(ano)!;
    await compute(
      ano,
      fingerprint(rows)!,
      rows.map(({ lote, ...row }) => row),
      calculado_em,
    );
    index.anos[ano] = {
      fingerprint: fingerprint(byYear.get(ano)!),
      calculado_em,
    };
  } catch (error) {
    // Stop at the first failure (budget or query) but keep finished years.
    failure = error;
    break;
  }
}
if (pending.length) {
  index.atualizado_em = calculado_em;
  await write(`${PREFIX}/indice.json`, index);
}
console.log(
  `R2 SQL nesta execução: ${(spent / 1e6).toFixed(0)} MB cobráveis (mínimo de 10 MB por consulta).`,
);
if (failure) {
  console.error(String((failure as Error).message ?? failure));
  process.exitCode = 1;
}
