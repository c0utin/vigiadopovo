import { deputies as dataset, mandates } from "#lib/server/deputies.ts";
import { normalize } from "#lib/format.ts";

// Plain HTML; deputados.js adds search and filters without a framework.
export const csr = false;

export function load() {
  const { deputies = [], collectedAt = null, year = null } = dataset ?? {};
  const values = (key: "party" | "state") =>
    [...new Set(deputies.map((d) => d[key]).filter((v) => v !== null))].sort();
  const history = new Map(
    (mandates?.deputies ?? []).map((d) => [d.id, d.mandates]),
  );
  const count = new Map<number, number>();
  for (const d of mandates?.deputies ?? [])
    for (const m of d.mandates)
      count.set(m.legislature, (count.get(m.legislature) ?? 0) + 1);
  return {
    collectedAt,
    year,
    parties: values("party"),
    states: values("state"),
    // Former deputies load from deputados-mandatos.json only when asked for.
    legislatures: (mandates?.legislatures ?? []).map((l) => ({
      ...l,
      deputies: count.get(l.id) ?? 0,
    })),
    everyone: mandates?.deputies.length ?? 0,
    // Only card fields: profiles carry the full record.
    deputies: deputies
      .map((d) => {
        const served = history.get(d.id) ?? [];
        return {
          id: d.id,
          name: d.name,
          party: d.party,
          state: d.state,
          condition: d.condition,
          photo: d.photo,
          points: d.score?.points ?? null,
          rank: d.score?.rank ?? null,
          search: normalize(`${d.name} ${d.civilName ?? ""}`),
          legislatures: served.map((m) => m.legislature),
          // "|57:PL|56:PSL|": parties per mandate, for the party filter.
          parties: `|${served.flatMap((m) => m.parties.map((p) => `${m.legislature}:${p}`)).join("|")}|`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}
