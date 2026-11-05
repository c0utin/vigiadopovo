// Public contract of static/deputados.json; built by scripts/deputies.mjs.
export type ActivityKey =
  "plenaryVotes" | "committeeVotes" | "propositions" | "speeches" | "organs";

export interface Deputy {
  id: number;
  name: string;
  civilName: string | null;
  party: string | null;
  state: string | null;
  status: string | null;
  condition: string | null;
  statusSince: string | null;
  schooling: string | null;
  birthplace: string | null;
  /** Site path of the official photo, or null when it could not be fetched. */
  photo: string | null;
  profileUrl: string;
  apiUrl: string;
  counts: Record<ActivityKey, number>;
  /** Midrank percentile among the deputies in this dataset, 0–100. */
  percentiles: Record<ActivityKey, number>;
  organs: {
    acronym: string;
    name: string;
    role: string;
    since: string | null;
  }[];
  /** Parties recorded alongside this deputy's votes during the year. */
  parties: { party: string; from: string | null; until: string | null }[];
  recentVotes: {
    id: string;
    date: string;
    vote: string;
    description: string;
    propositions: { id: number; label: string }[];
    url: string;
  }[];
}

export interface DeputiesDataset {
  schemaVersion: 1;
  collectedAt: string;
  year: number;
  legislature: number;
  coverage: string;
  nominalVotings: { plenary: number; committee: number };
  activity: readonly {
    key: ActivityKey;
    label: string;
    /** Radar axis label. */
    short: string;
    description: string;
  }[];
  sources: {
    url: string;
    collectedAt: string;
    sha256: string;
    bytes: number;
  }[];
  deputies: Deputy[];
}

/** Public contract of static/deputados-mandatos.json. */
export interface MandatesDataset {
  schemaVersion: 1;
  collectedAt: string;
  /** Newest first. */
  legislatures: { id: number; start: string; end: string | null }[];
  /** Inconsistent official rows left out instead of guessed. */
  excluded: { rows: number; reason: string };
  deputies: {
    id: number;
    /** Name and state from the most recent mandate. */
    name: string;
    state: string | null;
    /** Newest first; parties as listed by the Câmara for that legislature. */
    mandates: {
      legislature: number;
      state: string | null;
      parties: string[];
    }[];
  }[];
}
