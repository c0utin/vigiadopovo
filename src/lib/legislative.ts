// Public data contracts; no runtime SDKs or network requests in the browser.
export interface ThemeLabel {
  id: string;
  name: string;
  sourceUrl: string;
  relevance: number;
}

export interface LegislativeDataset {
  schemaVersion: 1;
  collectedAt: string;
  coverage: string;
  propositions: readonly {
    id: number;
    label: string;
    ementa: string;
    url: string;
    labels: readonly ThemeLabel[];
    votingIds: readonly string[];
  }[];
  votings: readonly {
    id: string;
    date: string;
    description: string;
    organ: string;
    url: string;
    ballotsUrl: string;
    approval: number | null;
    propositionIds: readonly number[];
    ballotCoverage: "recorded-votes" | "no-individual-records";
    ballots: readonly {
      deputyId: number;
      name: string;
      party: string | null;
      state: string | null;
      legislature: number | null;
      vote: string;
      registeredAt: string | null;
    }[];
  }[];
}
