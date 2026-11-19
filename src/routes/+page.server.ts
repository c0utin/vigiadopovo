import { listProposals } from "#lib/server/proposals.ts";

// The homepage is plain HTML; search and topic filters are a small inline
// enhancement (see feed.js), so no framework JavaScript is shipped.
export const csr = false;

// The collection keeps every bill it has seen, so the homepage lists only the
// newest and links to /propostas/ for the rest (14 KiB budget, perf:check).
export const load = () => listProposals(50);
