import { deputies } from "#lib/server/deputies.ts";

// The ranking exists only once a collection carries the quality score; until
// then no tab or shortcut may lead to an empty page.
export const load = () => ({ ranking: Boolean(deputies?.quality) });
