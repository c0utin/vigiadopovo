import { resolve } from "$app/paths";
import portal from "#lib/portal.ts";
import { markdown, propositionPage } from "#lib/server/ai.ts";

export const prerender = true;

export function entries() {
  return portal.propositions.map((p) => ({ id: String(p.id) }));
}
export function GET({ params, url }: { params: { id: string }; url: URL }) {
  const p = portal.propositions.find((p) => String(p.id) === params.id)!;
  return markdown(
    propositionPage(p, new URL(resolve("/"), url).href.slice(0, -1)),
  );
}
