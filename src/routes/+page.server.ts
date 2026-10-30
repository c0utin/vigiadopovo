import portal from "#lib/portal.ts";

// Ship only card/search fields, never full voting histories or source captures.
export function load() {
  return {
    collectedAt: portal.collectedAt,
    propositions: portal.propositions.map((p) => ({
      id: p.id,
      label: p.label,
      ementa: p.ementa,
      presentedAt: p.presentedAt,
      authors: p.authors.map((author) => author.name).join(" "),
      voteCount: p.votes.length,
      summary: p.summary
        ? {
            title: p.summary.title,
            text: p.summary.text,
            topic: p.summary.topic,
          }
        : null,
    })),
  };
}
