import portal from "#lib/portal.ts";
import { normalize } from "#lib/format.ts";

// The homepage is plain HTML; search and topic filters are a small inline
// enhancement (see feed.js), so no framework JavaScript is shipped.
export const csr = false;

const PERIODS = [
  { title: "Últimos 7 dias", maxDays: 7 },
  { title: "Últimos 30 dias", maxDays: 30 },
  { title: "Mais antigas", maxDays: Infinity },
];

// Ship only card/search fields, never full voting histories or source captures.
export function load() {
  // Periods are relative to the collection day in Brasília, not to the visit:
  // the site is a static snapshot.
  const reference = Date.parse(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(portal.collectedAt),
    ),
  );
  const propositions = portal.propositions
    .map((p) => {
      // What makes a proposal "hot" is its latest movement, not its age.
      const events = [
        { kind: "Apresentada", date: p.presentedAt },
        // On ties the earlier entry wins, so a vote beats a generic step.
        ...p.votes.map((vote) => ({ kind: "Votação", date: vote.date })),
        { kind: "Andamento", date: p.status?.dataHora },
      ]
        .filter((event): event is { kind: string; date: string } =>
          Boolean(event.date),
        )
        .map((event) => ({ ...event, date: event.date.slice(0, 10) }));
      const latest = events.reduce((a, b) => (b.date > a.date ? b : a));
      const age = (reference - Date.parse(latest.date)) / 86_400_000;
      return {
        id: p.id,
        label: p.label,
        latest,
        period: PERIODS.findIndex((period) => age <= period.maxDays),
        // "Apresentação de Proposição" is the first step; say it plainly.
        stage:
          p.status?.descricaoSituacao ??
          (p.status?.descricaoTramitacao === "Apresentação de Proposição"
            ? "Recém-apresentada"
            : p.status?.descricaoTramitacao),
        title: p.summary?.title ?? p.label,
        text: p.summary?.text ?? p.ementa,
        topic: p.summary?.topic ?? null,
        search: normalize(
          `${p.label} ${p.ementa} ${p.summary?.title ?? ""} ${p.summary?.topic ?? ""} ${p.authors.map((a) => a.name).join(" ")}`,
        ),
      };
    })
    .toSorted((a, b) => b.latest.date.localeCompare(a.latest.date));
  return {
    collectedAt: portal.collectedAt,
    total: propositions.length,
    periods: PERIODS.map((period, index) => ({
      title: period.title,
      propositions: propositions.filter((p) => p.period === index),
    })).filter((period) => period.propositions.length),
  };
}
