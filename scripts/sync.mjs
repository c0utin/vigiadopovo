import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://dadosabertos.camara.leg.br/api/v2";
export function officialUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    ![
      "camara.leg.br",
      "www.camara.leg.br",
      "dadosabertos.camara.leg.br",
      "www2.camara.leg.br",
    ].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(`URL fora das fontes permitidas: ${url.hostname}`);
  }
  return url.href;
}

async function get(url) {
  const response = await fetch(officialUrl(url), {
    signal: AbortSignal.timeout(30000),
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Câmara retornou HTTP ${response.status}: ${url}`);
  return response.json();
}

async function all(url) {
  const items = [];
  const seen = new Set();
  while (url) {
    if (seen.has(url)) throw new Error("Paginação circular na API");
    seen.add(url);
    const page = await get(url);
    items.push(...page.dados);
    url = page.links?.find((link) => link.rel === "next")?.href;
  }
  return items;
}

export function sourceHash(proposition) {
  // Summaries explicitly cover the ementa, not the full bill or its changing status.
  return createHash("sha256")
    .update(JSON.stringify([proposition.id, proposition.ementa]))
    .digest("hex");
}

export function attachSummary(proposition, summaries) {
  const candidate = summaries[proposition.id];
  if (!candidate || candidate.sourceHash !== sourceHash(proposition))
    return null;
  if (
    !["title", "text", "topic", "generatedAt"].every(
      (key) => typeof candidate[key] === "string" && candidate[key].trim(),
    )
  )
    throw new Error(`Resumo inválido: ${proposition.id}`);
  if (Number.isNaN(Date.parse(candidate.generatedAt)))
    throw new Error(`Data de resumo inválida: ${proposition.id}`);
  return {
    ...candidate,
    scope: "ementa",
    method: "Inferência neste chat · sem revisão humana",
  };
}

export async function sync() {
  const collectedAt = new Date().toISOString();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const year = today.slice(0, 4);
  const recent = await get(
    `${API}/proposicoes?siglaTipo=PL&ano=${year}&itens=6&ordem=DESC&ordenarPor=id`,
  );
  // A deliberately bounded discovery window, not a claim of complete coverage.
  const monthStart = `${today.slice(0, 7)}-01`;
  const voteList = await get(
    `${API}/votacoes?dataInicio=${monthStart}&dataFim=${today}&itens=8&ordem=DESC&ordenarPor=dataHoraRegistro`,
  );
  const recentVotes = [];
  for (const vote of voteList.dados)
    recentVotes.push((await get(`${API}/votacoes/${vote.id}`)).dados);
  const previous = await readFile("src/lib/data/portal.json", "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return { propositions: [] };
      throw error;
    });
  const ids = new Set([
    ...previous.propositions.map((p) => p.id),
    ...recent.dados.map((p) => p.id),
  ]);
  for (const vote of recentVotes)
    for (const p of vote.proposicoesAfetadas ?? []) ids.add(p.id);
  const summaries = JSON.parse(await readFile("data/summaries.json", "utf8"));
  const propositions = [];
  const pending = [];
  for (const id of ids) {
    const p = (await get(`${API}/proposicoes/${id}`)).dados;
    const authors = await all(`${API}/proposicoes/${id}/autores`);
    const votes = await all(`${API}/proposicoes/${id}/votacoes`);
    const summary = attachSummary(p, summaries);
    if (!summary)
      pending.push({
        id,
        sourceHash: sourceHash(p),
        ementa: p.ementa,
        source: p.uri,
      });
    propositions.push({
      id: p.id,
      label: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      type: p.descricaoTipo,
      ementa: p.ementa,
      presentedAt: p.dataApresentacao,
      status: p.statusProposicao,
      authors: authors.map((a) => ({ name: a.nome, type: a.tipo })),
      url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}`,
      apiUrl: officialUrl(p.uri),
      documentUrl: officialUrl(p.urlInteiroTeor),
      votes: votes.map((v) => ({
        id: v.id,
        date: v.data,
        description: v.descricao,
        organ: v.siglaOrgao,
        url: officialUrl(v.uri),
      })),
      sourceHash: sourceHash(p),
      summary,
    });
  }
  propositions.sort((a, b) => b.presentedAt.localeCompare(a.presentedAt));
  const output = {
    collectedAt,
    coverage: "Câmara dos Deputados · amostra de proposições e votações",
    propositions,
  };
  await mkdir("src/lib/data", { recursive: true });
  await mkdir("static", { recursive: true });
  // Publish only after every request and validation succeeds; a failure keeps the last snapshot.
  for (const [path, value] of [
    ["src/lib/data/portal.json", output],
    ["static/dados.json", output],
    ["data/pending.json", pending],
    ["data/recent-votes.json", { collectedAt, votes: recentVotes }],
  ]) {
    await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
    await rename(`${path}.tmp`, path);
  }
  console.log(
    `${propositions.length} proposições coletadas; ${propositions.filter((p) => p.summary).length} resumos válidos; ${pending.length} aguardando resumo.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  sync().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
