// Public contract of static/deputados.json; built by scripts/deputies.ts.
export type ActivityKey =
  "plenaryVotes" | "committeeVotes" | "propositions" | "speeches" | "organs";

/** Where a bill stands, read from its official situation (see `bills.outcomes`). */
export type BillOutcome =
  | "law"
  | "lawVia"
  | "approved"
  | "approvedVia"
  | "active"
  | "rejected"
  | "closed";

/** What a bill is about, read from its ementa by fixed rules (see `bills.kinds`). */
export type BillKind = "honorific" | "sustacao" | "other";

/** Furthest step a bill reached, by fixed rules (see `quality.stages`). */
export type QualityStage =
  "presented" | "rapporteur" | "opinion" | "committee" | "camara" | "law";

/** Why a bill's quality weight was lowered (see `quality.reasons`). */
export type QualityReason =
  "honorific" | "authorizing" | "concession" | "local" | "copy" | "returned";

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
  /** Bills presented in the current legislature as author or co-author, newest first. */
  bills: {
    id: number;
    /** e.g. "PL 1234/2025". */
    label: string;
    ementa: string;
    presentedAt: string;
    /** Official situation, or the last step when the Câmara leaves it blank. */
    situation: string | null;
    statusAt: string | null;
    outcome: BillOutcome;
    kind: BillKind;
    /**
     * For `lawVia` and `approvedVia`: the bill whose approval made this one
     * prejudicado, with that bill's official situation. Null otherwise.
     */
    /** `cited`: the label the despacho names, older when renumbered. */
    via: {
      id: number;
      label: string;
      cited: string;
      situation: string | null;
    } | null;
    /** First signer; otherwise a co-author. */
    firstAuthor: boolean;
    quality: {
      stage: QualityStage;
      /** Applied to the reach of the norm as in `quality.weights`. */
      reasons: QualityReason[];
      /** The earlier bill this one copies, when `copy` is a reason. */
      copyOf: { id: number; label: string } | null;
      /**
       * Factors of `share` when the bill reached a scoring stage, else null:
       * share = weight × base ÷ pool ÷ proponents, rounded to cents. `pool`
       * is the number of bills approved through the same principal, else 1.
       */
      calc: {
        weight: number;
        base: number;
        pool: number;
        proponents: number;
      } | null;
      /** This deputy's points from the bill. */
      share: number;
    };
  }[];
  /** Quality-weighted outcomes, never counts (see `quality`). */
  score: {
    /** authorPoints + reportPoints: the exact sum of every listed share. */
    points: number;
    authorPoints: number;
    reportPoints: number;
    /** Competition rank among deputies in office: ties share a rank. */
    rank: number;
    /** Best and worst rank over every alternative weighting. */
    rankRange: [number, number];
    /**
     * Bills this deputy reported that the Câmara approved, best first:
     * share = weight × base ÷ rapporteurs, rounded to cents.
     */
    reports: {
      id: number;
      label: string;
      stage: QualityStage;
      weight: number;
      base: number;
      rapporteurs: number;
      share: number;
    }[];
  };
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
  bills: {
    /** Start of the current legislature: bills presented since then. */
    since: string;
    types: readonly string[];
    /** Display order. */
    outcomes: readonly {
      key: BillOutcome;
      label: string;
      description: string;
    }[];
    /** Display order; `other` is not labelled on the page. */
    kinds: readonly {
      key: BillKind;
      label: string;
      description: string;
    }[];
  };
  quality: {
    version: number;
    /** Reference date of the scoring input. */
    asOf: string;
    /** Site path of the exact scoring input, and SHA-256 of its bytes. */
    input: string;
    inputSha256: string;
    /** SHA-256 of the scoring result; `pnpm data:quality` replays it. */
    outputSha256: string;
    /** Display order. */
    stages: readonly {
      key: QualityStage;
      label: string;
      description: string;
    }[];
    reasons: readonly {
      key: QualityReason;
      label: string;
      description: string;
      source: string;
    }[];
    weights: { reach: Record<string, number>; low: number; local: number };
    points: {
      law: number;
      camara: number;
      lawVia: number;
      approvedVia: number;
    };
    reportPoints: { law: number; camara: number };
    copySimilarity: number;
    variants: readonly { key: string; label: string }[];
    /**
     * Principals that archived bills name as approved but no official
     * source identifies; those bills stay archived (see `scoreQuality`).
     */
    unresolvedPrincipals: readonly { label: string; bills: number }[];
  };
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
