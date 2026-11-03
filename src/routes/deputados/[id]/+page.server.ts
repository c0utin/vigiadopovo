import { error } from "@sveltejs/kit";
import { deputies as dataset } from "#lib/server/deputies.ts";

export const csr = false;

export function entries() {
  return (dataset?.deputies ?? []).map((d) => ({ id: String(d.id) }));
}
export function load({ params }: { params: { id: string } }) {
  const data = dataset;
  const deputy = data?.deputies.find((d) => String(d.id) === params.id);
  if (!data || !deputy) error(404, "Deputado não encontrado");
  return {
    deputy,
    total: data.deputies.length,
    year: data.year,
    collectedAt: data.collectedAt,
    activity: data.activity,
    nominalVotings: data.nominalVotings,
    sources: data.sources,
  };
}
