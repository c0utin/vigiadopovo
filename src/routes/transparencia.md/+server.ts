import { resolve } from "$app/paths";
import { deputies } from "#lib/server/deputies.ts";
import { markdown, transparency } from "#lib/server/ai.ts";

export const prerender = true;

export const GET = ({ url }: { url: URL }) =>
  markdown(
    transparency(new URL(resolve("/"), url).href.slice(0, -1), deputies),
  );
