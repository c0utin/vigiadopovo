import { resolve } from "$app/paths";
import { deputies } from "#lib/server/deputies.ts";
import { index, markdown } from "#lib/server/ai.ts";

export const prerender = true;

// Index for AI assistants (llmstxt.org): what the site is and a link to every
// page as Markdown.
export const GET = ({ url }: { url: URL }) =>
  markdown(index(new URL(resolve("/"), url).href.slice(0, -1), deputies));
