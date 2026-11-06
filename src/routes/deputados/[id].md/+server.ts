import { resolve } from "$app/paths";
import { deputies as dataset } from "#lib/server/deputies.ts";
import { deputy, markdown } from "#lib/server/ai.ts";

export const prerender = true;

export function entries() {
  return (dataset?.deputies ?? []).map((d) => ({ id: String(d.id) }));
}
export function GET({ params, url }: { params: { id: string }; url: URL }) {
  const d = dataset!.deputies.find((d) => String(d.id) === params.id)!;
  return markdown(
    deputy(d, dataset!, new URL(resolve("/"), url).href.slice(0, -1)),
  );
}
