import { deputies } from "#lib/server/deputies.ts";

// Deputies with a profile page: only their votes link to it.
export function load() {
  return { profileIds: deputies?.deputies.map((d) => d.id) ?? [] };
}
