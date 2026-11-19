import { listProposals } from "#lib/server/proposals.ts";

export const csr = false;

export const load = () => listProposals();
