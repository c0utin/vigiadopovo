import { resolve } from "$app/paths";
import { mandates } from "#lib/server/deputies.ts";
import { history, markdown } from "#lib/server/ai.ts";

export const prerender = true;

// Every deputy since 1826, as the Deputados list filters them by legislature.
export const GET = ({ url }: { url: URL }) =>
  markdown(history(mandates, new URL(resolve("/"), url).href.slice(0, -1)));
