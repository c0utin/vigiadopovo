import portal from "#lib/portal.ts";
import { normalize } from "#lib/format.ts";
import { deputies } from "#lib/server/deputies.ts";

// The homepage is plain HTML; search and topic filters are a small inline
// enhancement (see feed.js), so no framework JavaScript is shipped.
export const csr = false;

const PERIODS = [
  { title: "Últimos 7 dias", maxDays: 7 },
  { title: "Últimos 30 dias", maxDays: 30 },
  { title: "Mais antigas", maxDays: Infinity },
];

// Ship only row and search fields, never full voting histories or source captures.
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
        { date: p.presentedAt },
        // On ties the earlier entry wins, so a vote beats a generic step.
        ...p.votes.map((vote) => ({ date: vote.date })),
        { date: p.status?.dataHora },
      ]
        .filter((event): event is { date: string } => Boolean(event.date))
        .map((event) => event.date.slice(0, 10));
      const latest = events.reduce((a, b) => (b > a ? b : a));
      const age = (reference - Date.parse(latest)) / 86_400_000;
      return {
        period: PERIODS.findIndex((period) => age <= period.maxDays),
        row: {
          id: p.id,
          label: p.label,
          date: latest,
          // Without an AI summary the official ementa is the title.
          title: p.summary?.title ?? p.ementa,
          // "Apresentação de Proposição" is the first step; the date already says it.
          stage:
            p.status?.descricaoSituacao ??
            (p.status?.descricaoTramitacao === "Apresentação de Proposição"
              ? null
              : p.status?.descricaoTramitacao),
          topic: p.summary?.topic ?? null,
          search: normalize(
            `${p.label} ${p.ementa} ${p.summary?.title ?? ""} ${p.summary?.topic ?? ""} ${p.authors.map((a) => a.name).join(" ")}`,
          ),
        },
      };
    })
    .toSorted((a, b) => b.row.date.localeCompare(a.row.date));
  return {
    collectedAt: portal.collectedAt,
    // "Quem é o meu deputado?": a plain GET form to /deputados/?uf=.
    states: [
      ...new Set(
        (deputies?.deputies ?? [])
          .map((d) => d.state)
          .filter((s) => s !== null),
      ),
    ].sort(),
    total: propositions.length,
    periods: PERIODS.map((period, index) => ({
      title: period.title,
      propositions: propositions
        .filter((p) => p.period === index)
        .map((p) => p.row),
    })).filter((period) => period.propositions.length),
  };
}
