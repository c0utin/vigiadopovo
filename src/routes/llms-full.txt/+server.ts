import { resolve } from "$app/paths";
import { deputies } from "#lib/server/deputies.ts";
import { full, markdown } from "#lib/server/ai.ts";

export const prerender = true;

// Every proposition, voting and ballot in one Markdown file.
export const GET = ({ url }: { url: URL }) =>
  markdown(full(new URL(resolve("/"), url).href.slice(0, -1), deputies));
