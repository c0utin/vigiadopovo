import { deputies as dataset } from "#lib/server/deputies.ts";
import { normalize } from "#lib/format.ts";

// Plain HTML; deputados.js adds search and filters without a framework.
export const csr = false;

export function load() {
  const { deputies = [], collectedAt = null, year = null } = dataset ?? {};
  const values = (key: "party" | "state") =>
    [...new Set(deputies.map((d) => d[key]).filter((v) => v !== null))].sort();
  return {
    collectedAt,
    year,
    parties: values("party"),
    states: values("state"),
    // Only card fields: profiles carry the full record.
    deputies: deputies
      .map((d) => ({
        id: d.id,
        name: d.name,
        party: d.party,
        state: d.state,
        condition: d.condition,
        photo: d.photo,
        search: normalize(`${d.name} ${d.civilName ?? ""}`),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}
