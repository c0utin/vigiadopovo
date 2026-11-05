import { error } from "@sveltejs/kit";
import { deputies as dataset } from "#lib/server/deputies.ts";

export const csr = false;

export function entries() {
  return (dataset?.deputies ?? []).map((d) => ({ id: String(d.id) }));
}
export function load({ params }: { params: { id: string } }) {
  const deputy = dataset?.deputies.find((d) => String(d.id) === params.id);
  if (!dataset || !deputy) error(404, "Deputado não encontrado");
  return {
    deputy,
    total: dataset.deputies.length,
    year: dataset.year,
    collectedAt: dataset.collectedAt,
    activity: dataset.activity,
    nominalVotings: dataset.nominalVotings,
    sources: dataset.sources,
  };
}
