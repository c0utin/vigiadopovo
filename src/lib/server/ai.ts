// Plain Markdown versions of the site's data, for people who paste a link into
// an AI assistant. Every number comes from the same snapshot files as the
// HTML pages; nothing here is computed differently.
import { existsSync } from "node:fs";
import legislative from "../../../static/legislativo.json";
import portal, { type Proposition } from "#lib/portal.ts";
import { date } from "#lib/format.ts";
import type {
  DeputiesDataset,
  Deputy,
  MandatesDataset,
} from "#lib/deputies.ts";
import type { LegislativeDataset } from "#lib/legislative.ts";
import provenance from "#lib/data/provenance.json";
import { DEFINITIONS } from "../../../worker/definitions.ts";

const data = legislative as LegislativeDataset;
type Voting = LegislativeDataset["votings"][number];

const collected = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value)) + " (Brasília)";

// One line, so a value never breaks a list item or table cell.
const inline = (value: string) => value.replace(/\s+/g, " ").trim();

// The summary title, or the start of the ementa when there is none.
const title = (p: Proposition) => {
  if (p.summary) return p.summary.title;
  const text = inline(p.ementa);
  return text.length <= 90
    ? text
    : `${text.slice(0, 90).replace(/\s+\S*$/, "")}…`;
};

const NOTE =
  "Fonte: dados abertos oficiais da Câmara dos Deputados, coletados pelo Vigia do Povo (projeto independente, sem vínculo com partidos ou governo). Resumos marcados como IA explicam só a ementa e não substituem o texto oficial.";

export const markdown = (body: string) =>
  new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });

function tally(voting: Voting) {
  const counts = new Map<string, number>();
  for (const b of voting.ballots)
    counts.set(b.vote, (counts.get(b.vote) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([vote, n]) => `${vote}: ${n}`)
    .join("; ");
}

function voting(v: Voting, ballots: boolean) {
  const lines = [
    `### ${date(v.date)} · ${v.organ}`,
    "",
    inline(v.description),
    "",
    `- Registro oficial: ${v.url}`,
  ];
  if (v.ballotCoverage === "no-individual-records")
    lines.push("- Sem registro individual de votos (votação simbólica).");
  else {
    lines.push(`- Votos registrados: ${v.ballots.length} (${tally(v)})`);
    if (ballots) {
      lines.push(
        "",
        "| Deputado | Partido | UF | Voto |",
        "| --- | --- | --- | --- |",
        ...v.ballots
          .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map(
            (b) =>
              `| ${b.name} | ${b.party ?? "—"} | ${b.state ?? "—"} | ${b.vote || "—"} |`,
          ),
      );
    }
  }
  return lines.join("\n");
}

export function proposition(p: Proposition, origin: string, ballots = true) {
  const votings = data.votings
    .filter((v) => v.propositionIds.includes(p.id))
    .toSorted((a, b) => b.date.localeCompare(a.date));
  const lines = [
    `## ${p.label}: ${title(p)}`,
    "",
    `- Página: ${origin}/proposta/${p.id}/`,
    `- Tipo: ${p.type}`,
    `- Apresentada em: ${date(p.presentedAt)}`,
    `- Autoria: ${p.authors.map((a) => a.name).join("; ") || "Não informada"}`,
    `- Situação atual: ${p.status?.descricaoSituacao ?? "Não informada pela Câmara"}`,
    `- Último andamento: ${p.status?.descricaoTramitacao ?? "Não informado"}${p.status?.dataHora ? ` (${date(p.status.dataHora)}${p.status.siglaOrgao ? `, ${p.status.siglaOrgao}` : ""})` : ""}`,
    `- Temas oficiais: ${p.labels?.map((l) => l.name).join("; ") || "sem classificação"}`,
    `- Ficha na Câmara: ${p.url}`,
  ];
  if (p.documentUrl) lines.push(`- Texto completo: ${p.documentUrl}`);
  lines.push(
    `- API da Câmara: ${p.apiUrl}`,
    `- Versão da ementa (SHA-256 de [id, ementa]): ${p.sourceHash}`,
  );
  lines.push("", "**Ementa oficial:**", "", `> ${inline(p.ementa)}`);
  if (p.summary)
    lines.push(
      "",
      `**Resumo em linguagem simples (gerado por IA em ${date(p.summary.generatedAt)}, ${p.summary.method}; explica só a ementa):** ${inline(p.summary.text)}`,
    );
  if (p.status?.despacho)
    lines.push("", `**Despacho:** ${inline(p.status.despacho)}`);
  lines.push(
    "",
    `**Votações (${votings.length}).** Inclui requerimentos e etapas; aprovar uma votação não significa que a proposta virou lei.`,
  );
  for (const v of votings) lines.push("", voting(v, ballots));
  return lines.join("\n");
}

export function propositionPage(p: Proposition, origin: string) {
  return `# Vigia do Povo · ${p.label}

${NOTE} Coletado em ${collected(portal.collectedAt)}.

${proposition(p, origin)}
`;
}

export function deputy(d: Deputy, dataset: DeputiesDataset, origin: string) {
  const activity = dataset.activity
    .map(
      (a) =>
        `| ${a.label} | ${d.counts[a.key]} | ${Math.round(d.percentiles[a.key])} | ${inline(a.description)} |`,
    )
    .join("\n");
  const organs = d.organs.length
    ? d.organs
        .map(
          (o) =>
            `- ${o.acronym} (${o.name}): ${o.role}${o.since ? `, desde ${date(o.since)}` : ""}`,
        )
        .join("\n")
    : "- Nenhum órgão nesta coleta.";
  const votes = d.recentVotes.length
    ? [
        "| Data | Voto | Votação | Proposições |",
        "| --- | --- | --- | --- |",
        ...d.recentVotes.map(
          (v) =>
            `| ${date(v.date)} | ${v.vote || "—"} | ${inline(v.description).replaceAll("|", "/")} | ${v.propositions.map((p) => p.label).join(", ") || "—"} |`,
        ),
      ].join("\n")
    : "Nenhum voto nominal registrado nesta coleta.";
  // A deputados.json collected before bills existed has neither field.
  const bills =
    dataset.bills && d.bills
      ? `

## Projetos apresentados (${d.bills.length})

${dataset.bills.types.join(", ")} apresentados desde ${date(dataset.bills.since)}, início da legislatura, como autor ou coautor. A situação é a última registrada pela Câmara. Um projeto tramitando em conjunto segue o destino do projeto ao qual foi anexado.

${dataset.bills.outcomes.map((o) => `- ${o.label}: ${d.bills.filter((b) => b.outcome === o.key).length}`).join("\n")}
${dataset.bills.outcomes
  .map((o) => {
    const group = d.bills.filter((b) => b.outcome === o.key);
    if (!group.length) return "";
    return `
### ${o.label} (${group.length})

${inline(o.description)}

${group
  .map(
    (b) =>
      `- **${b.label}** (apresentado em ${date(b.presentedAt)}${b.firstAuthor ? "" : ", coautoria"}): ${inline(b.ementa)} Situação: ${b.situation ?? "não informada"}${b.statusAt ? ` (${date(b.statusAt)})` : ""}. Tramitação: https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${b.id}`,
  )
  .join("\n")}
`;
  })
  .join("")}`
      : "";
  return `# Vigia do Povo · ${d.name}

${NOTE} Coletado em ${collected(dataset.collectedAt)}.

- Página: ${origin}/deputados/${d.id}/
- Nome civil: ${d.civilName ?? "Não informado"}
- Partido: ${d.party ?? "—"} · UF: ${d.state ?? "—"}
- Situação: ${d.status ?? "—"}${d.condition ? ` (${d.condition})` : ""}${d.statusSince ? `, desde ${date(d.statusSince)}` : ""}
- Escolaridade: ${d.schooling ?? "Não informada"}
- Naturalidade: ${d.birthplace ?? "Não informada"}
- Partidos registrados nos votos do ano: ${d.parties.map((p) => p.party).join(", ") || "—"}
- Perfil na Câmara: ${d.profileUrl}
- API da Câmara: ${d.apiUrl}
- Métricas de votos por ano (JSON, desde 2003, parâmetro \`ano\`): ${origin}/api/metricas/deputados/${d.id}

## Atividade em ${dataset.year}

Percentil: posição entre os ${dataset.deputies.length} deputados desta coleta (0 a 100). Contagens altas não significam trabalho melhor. Em ${dataset.year}, houve ${dataset.nominalVotings.plenary} votações nominais no Plenário e ${dataset.nominalVotings.committee} em outros órgãos com registro individual.

| Atividade | Total | Percentil | O que conta |
| --- | --- | --- | --- |
${activity}

## Órgãos

${organs}

## Votos nominais recentes

${votes}
${bills}`;
}

export function index(origin: string, deputies: DeputiesDataset | null) {
  const propositions = portal.propositions
    .map((p) => `- [${p.label}: ${title(p)}](${origin}/proposta/${p.id}.md)`)
    .join("\n");
  const profiles = (deputies?.deputies ?? [])
    .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(
      (d) =>
        `- [${d.name} (${d.party ?? "—"}-${d.state ?? "—"})](${origin}/deputados/${d.id}.md)`,
    )
    .join("\n");
  return `# Vigia do Povo

> O que a Câmara dos Deputados vota, quem votou e como, a partir só de dados oficiais. Projeto independente e de código aberto.

${NOTE} Coletado em ${collected(portal.collectedAt)}.

Para usar este site como contexto numa IA, cole o link desta página ou de qualquer arquivo abaixo. Cada link termina em \`.md\` e é texto simples.

## Tudo num arquivo

- [Todos os dados (propostas, votações e cada voto, deputados)](${origin}/llms-full.txt)
- [Todos os deputados desde 1826, com legislaturas e partidos](${origin}/deputados-historico.md)
- [Transparência: coleta, hashes e arquivos de origem](${origin}/transparencia.md)

## Propostas

${propositions}

## Deputados em exercício

${profiles || "- Lista de deputados indisponível nesta versão do site."}

## Métricas (JSON, desde 2003)

Calculadas dos arquivos anuais oficiais da Câmara. Parâmetro opcional \`ano\` (padrão: ano atual).

- [Alinhamento com uma bancada](${origin}/api/metricas/alinhamento?bancada=Governo): ${DEFINITIONS.alinhamento} Valores de \`bancada\`: Governo, Oposição, Maioria, Minoria.
- [Votações por mês](${origin}/api/metricas/votacoes): ${DEFINITIONS.votacoes}
- [Votos de um deputado](${origin}/api/metricas/deputados/204554): ${DEFINITIONS.deputado} Troque o número final pelo id do deputado (está no link do perfil).
- [Fontes do ano](${origin}/api/metricas/fontes): ${DEFINITIONS.fontes}

## Dados brutos

- [Propostas (JSON)](${origin}/dados.json)
- [Votações com cada voto (JSON)](${origin}/legislativo.json)
- [Deputados em exercício (JSON)](${origin}/deputados.json)
- [Deputados desde 1826 (JSON)](${origin}/deputados-mandatos.json)
- [Fontes, método dos resumos, legislação e privacidade](${origin}/sobre/)
`;
}

export function full(origin: string, deputies: DeputiesDataset | null) {
  const propositions = portal.propositions
    .map((p) => proposition(p, origin))
    .join("\n\n");
  const members = deputies
    ? [
        `Deputados em exercício em ${deputies.year} (${deputies.deputies.length}). Perfil completo de cada um em ${origin}/deputados/<id>.md.`,
        "",
        "| Nome | Partido | UF | Votos em Plenário | Votos em comissões | Proposições | Discursos | Projetos na legislatura | Viraram lei | Perfil |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ...deputies.deputies
          .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map(
            (d) =>
              `| ${d.name} | ${d.party ?? "—"} | ${d.state ?? "—"} | ${d.counts.plenaryVotes} | ${d.counts.committeeVotes} | ${d.counts.propositions} | ${d.counts.speeches} | ${d.bills?.length ?? "—"} | ${d.bills?.filter((b) => b.outcome === "law").length ?? "—"} | ${origin}/deputados/${d.id}.md |`,
          ),
      ].join("\n")
    : "Lista de deputados indisponível nesta versão do site.";
  return `# Vigia do Povo: todos os dados

${NOTE} Coletado em ${collected(portal.collectedAt)}. Cobertura: ${portal.coverage}.

Índice e métricas por ano: ${origin}/llms.txt

# Propostas (${portal.propositions.length})

${propositions}

# Deputados

${members}
`;
}

export function history(mandates: MandatesDataset | null, origin: string) {
  if (!mandates)
    return `# Vigia do Povo: deputados desde 1826

Lista histórica indisponível nesta versão do site.
`;
  const legislatures = mandates.legislatures
    .map(
      (l) => `- ${l.id}ª: ${date(l.start)} a ${l.end ? date(l.end) : "atual"}`,
    )
    .join("\n");
  const rows = mandates.deputies
    .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(
      (d) =>
        `| ${d.name} | ${d.state ?? "—"} | ${d.mandates.map((m) => `${m.legislature}ª${m.parties.length ? ` (${m.parties.join(", ")})` : ""}`).join("; ")} | ${d.id} |`,
    )
    .join("\n");
  return `# Vigia do Povo: deputados desde 1826

${NOTE} Coletado em ${collected(mandates.collectedAt)}.

Todos os ${mandates.deputies.length} deputados com mandato registrado pela Câmara, com as legislaturas em que exerceram e os partidos listados pela Câmara em cada uma. Nome e UF são do mandato mais recente. ${mandates.excluded.rows} registros oficiais inconsistentes ficaram de fora: ${inline(mandates.excluded.reason)}

Deputados em exercício têm perfil completo em ${origin}/deputados/<id>.md (o id está na última coluna).

## Legislaturas

${legislatures}

## Deputados

| Nome | UF | Legislaturas (partidos) | id |
| --- | --- | --- | --- |
${rows}
`;
}

export function transparency(origin: string, deputies: DeputiesDataset | null) {
  const artifacts = provenance.artifacts
    .map(
      (a) =>
        `| ${a.kind} | ${a.sourceUrl ?? "—"} | ${a.capturedAt ? collected(a.capturedAt) : "—"} | ${a.bytes} | ${a.sha256} | ${origin}${a.url} |`,
    )
    .join("\n");
  const sources = deputies
    ? `

## Fontes dos perfis de deputados

Coletadas em ${collected(deputies.collectedAt)}. ${deputies.coverage}.

| Fonte | Coletada em | Bytes | SHA-256 |
| --- | --- | --- | --- |
${deputies.sources.map((s) => `| ${s.url} | ${collected(s.collectedAt)} | ${s.bytes} | ${s.sha256} |`).join("\n")}
`
    : "";
  const { counts } = provenance;
  return `# Vigia do Povo: transparência dos dados

${NOTE}

Explicação completa das etapas e limites: ${origin}/transparencia/

## Coleta das propostas e votações

- Coletado em: ${collected(provenance.collectedAt)}
- Cobertura: ${provenance.coverage}
- ${counts.propositions} propostas, ${counts.votings} votações, ${counts.ballots} registros individuais de voto, ${counts.labels} temas oficiais, ${counts.summaries} resumos
- Nova inferência por IA nesta execução: ${provenance.inferenceInThisRun ? "sim" : "não"}; revisão humana: ${provenance.humanReview === "not-performed" ? "não realizada" : provenance.humanReview}
- Manifesto: ${origin}${provenance.manifestUrl}
- SHA-256 do manifesto: ${provenance.manifestHash}
- Carimbo OpenTimestamps (Bitcoin): ${existsSync(`static/pipeline/timestamps/${provenance.manifestHash}.json.ots`) ? `${origin}/pipeline/timestamps/${provenance.manifestHash}.json.ots` : "ainda não publicado"}

Limites: não cobrimos todo o Congresso nem o Senado; a ausência de registro individual não comprova ausência ou abstenção; partido e UF são os do registro de voto; temas são classificações oficiais, sem ranking ideológico.

## Arquivos desta execução (${provenance.artifacts.length})

| Tipo | Fonte oficial | Capturado em | Bytes | SHA-256 | Cópia |
| --- | --- | --- | --- | --- | --- |
${artifacts}
${sources}`;
}
