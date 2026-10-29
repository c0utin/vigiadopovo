import { error } from "@sveltejs/kit";
import portal from "#lib/portal.ts";

export function entries() {
  return portal.propositions.map((p) => ({ id: String(p.id) }));
}
export function load({ params }: { params: { id: string } }) {
  const proposal = portal.propositions.find((p) => String(p.id) === params.id);
  if (!proposal) error(404, "Proposta não encontrada");
  return { proposal, collectedAt: portal.collectedAt };
}
