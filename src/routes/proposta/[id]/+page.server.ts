import { error } from "@sveltejs/kit";
import portal from "#lib/portal.ts";
import type { LegislativeDataset } from "#lib/legislative.ts";
import legislative from "../../../../static/legislativo.json";

const data = legislative as LegislativeDataset;

export const csr = false;

export function entries() {
  return portal.propositions.map((p) => ({ id: String(p.id) }));
}
export function load({ params }: { params: { id: string } }) {
  const proposal = portal.propositions.find((p) => String(p.id) === params.id);
  if (!proposal) error(404, "Proposta não encontrada");
  const ballotCount = data.votings
    .filter((v) => v.propositionIds.includes(proposal.id))
    .reduce((sum, v) => sum + v.ballots.length, 0);
  return { proposal, collectedAt: portal.collectedAt, ballotCount };
}
