import { existsSync } from "node:fs";
import { deputies as dataset } from "#lib/server/deputies.ts";

// Plain HTML: the table and the method need no JavaScript.
export const csr = false;

export function load() {
  if (!dataset?.quality)
    return { quality: null, rows: [], collectedAt: null, since: "" };
  const rows = dataset.deputies
    .map((d) => {
      // Official outcomes, as on the profile: a law is "law" only; laws and
      // approvals through another bill are counted apart.
      const outcome = (key: string) =>
        d.bills.filter((b) => b.outcome === key).length;
      return {
        id: d.id,
        name: d.name,
        party: d.party,
        state: d.state,
        ...d.score,
        reports: d.score.reports.length,
        laws: outcome("law"),
        lawVia: outcome("lawVia"),
        approved: outcome("approved"),
        approvedVia: outcome("approvedVia"),
        filed: d.bills.length,
      };
    })
    // Rank, then id: never the machine's collation.
    .sort((a, b) => a.rank - b.rank || a.id - b.id);
  return {
    quality: dataset.quality,
    // Written next to deputados.json but stored apart; a copy without it
    // must not link to a missing file.
    inputPublished: existsSync(`static${dataset.quality.input}`),
    since: dataset.bills.since,
    collectedAt: dataset.collectedAt,
    rows,
  };
}
