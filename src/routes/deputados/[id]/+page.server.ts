import { error } from "@sveltejs/kit";
import { deputies as dataset, medianPoints } from "#lib/server/deputies.ts";
import portal from "#lib/portal.ts";

export const csr = false;

export function entries() {
  return (dataset?.deputies ?? []).map((d) => ({ id: String(d.id) }));
}
export function load({ params }: { params: { id: string } }) {
  const deputy = dataset?.deputies.find((d) => String(d.id) === params.id);
  if (!dataset || !deputy) error(404, "Deputado não encontrado");
  // Bills whose page here explains the ementa in plain language.
  const pages = new Set(
    portal.propositions.filter((p) => p.summary).map((p) => p.id),
  );
  return {
    deputy,
    total: dataset.deputies.length,
    year: dataset.year,
    collectedAt: dataset.collectedAt,
    activity: dataset.activity,
    bills: dataset.bills,
    quality: dataset.quality ?? null,
    explained: (deputy.bills ?? [])
      .filter((b) => pages.has(b.id))
      .map((b) => b.id),
    nominalVotings: dataset.nominalVotings,
    sources: dataset.sources,
    medianPoints,
  };
}
