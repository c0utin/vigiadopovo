// Every rule that turns official records into a bill's outcome, kind,
// quality weight and points, and a deputy's score. Pure and deterministic:
// no clock, network, randomness, locale or transcendental math. The same
// input always gives the same bytes, whatever the order of its arrays, so
// anyone can replay a published input (`pnpm data:quality`).
import type {
  BillKind,
  BillOutcome,
  QualityReason,
  QualityStage,
} from "../../src/lib/deputies.ts";

/** Bump when any rule or constant in this file changes. */
export const QUALITY_VERSION = 3;

// ---------------------------------------------------------------- ementa rules

// Tried in order after lowercasing and removing accents. The honorific
// list is deliberately narrow: seals, tourist routes and awareness
// campaigns stay in "other". Hand-checked on 50 random bills per class of
// the 57th legislature, with no misclassification.
const MONTHS =
  "(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
const COLORS =
  "(branco|roxo|lilas|amarelo|verde|azul|laranja|vermelho|dourado|rosa|cinza|marrom|prata|preto|bordo|violeta|anil|turquesa|vinho)";
const STARTS =
  "^(institui|cria|declara|estabelece|oficializa|fica instituid[oa]|dispoe sobre (a |o )?(instituicao|criacao)?( d[oa])?)\\b";
const HONOR_OBJECT =
  "(\\b(o|a)\\s+(dia|semana|mes|ano|decada|quinzena)\\b|calendario|\\bdenomina|\\btitulo de (capital|cidade|patrimonio)|capital nacional|patron[oa]|padroeir|livro dos herois|heroi|patrimonio (cultural|historico|imaterial)|interesse cultural|medalha|comenda|honraria|diploma\\b)";
const HONORIFIC = [
  // Dates.
  `${STARTS}(\\s*,[^,]{0,80},)?\\s+((o|a|os|as)\\s+)?["“‘']?(dia|semana|mes|ano|decada|quinzena)s?\\b`,
  "\\b(inclui|insere|inscreve|acrescenta|integra|institui|inclusao|insercao)\\b.{0,200}\\bcalendario\\b",
  `${STARTS}.{0,80}\\b${MONTHS}\\s+${COLORS}\\b`,
  // Names and titles.
  "^(denomina|redenomina|da (a )?(denominacao|nome)|da o nome|atribui (o nome|a denominacao|denominacao)|altera a denominacao|confere (a )?denominacao)\\b",
  "(^(confere|concede|atribui|outorga|declara|eleva|reconhece|institui)\\b.{0,160}\\b(titulo|cognome)\\b)|\\bcapital( [a-z-]+){0,3} (nacional|brasileira|do brasil)\\b",
  "^(declara|reconhece|proclama|confere|institui|eleva)\\b.{0,200}\\b(patron[oa]|padroeir[oa]|herois?|heroina|berco|cidade[- ]simbolo|simbolo nacional|precursora?)\\b",
  "livro (dos|de) herois",
  "^oficializa\\b",
  // Cultural recognition, honours and symbols.
  "^(reconhece|declara|eleva|confere|considera)\\b.{0,220}\\b(relevante interesse cultural|interesse cultural|manifestac[ao]o (da |de )?cultura|manifestacao cultural|patrimonio\\b|bem de natureza imaterial|expressao (da |de )?cultura)",
  "^(institui|cria|concede|confere|outorga|presta)\\b.{0,80}\\b(medalha|comenda|diploma (do |de )?(merito|honra)|premio|honraria|ordem do merito|galeria|homenagem|mencao honrosa)\\b",
  "^(institui|oficializa|declara|adota|cria)\\b.{0,60}\\b(o|a|como)\\s+(hino|bandeira|simbolo|mascote|brasao|flor|ave|arvore)\\b",
  // An existing law amended only to add one of the above.
  `^(altera|acrescenta|modifica)\\b.{0,250}\\bpara (instituir|incluir|denominar|declarar|conferir|inscrever|reconhecer|oficializar)\\b.{0,80}${HONOR_OBJECT}`,
].map((rule) => new RegExp(rule));
const SUSTACAO =
  /^(susta|sustam|sustar|fica(m)? sustad[oa]s?|suspende|torna sem efeito|anula)\b|^revoga\b.{0,40}\b(decreto(?! legislativo)|portaria|resolucao|instrucao normativa)|\bsust(a|ar|am)\b.{0,120}\b(efeitos?|decreto|portaria|resolucao|instrucao normativa|ato|norma|aplicacao|dispositivos?|deliberacao|parecer|nota tecnica|oficio|circular)\b/;

export const plain = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’ ]+/, "");

export function billKind(type: string, ementa: string): BillKind {
  const text = plain(ementa);
  if (type === "PDL" && SUSTACAO.test(text)) return "sustacao";
  return HONORIFIC.some((rule) => rule.test(text)) ? "honorific" : "other";
}

// CCJC Súmula de Jurisprudência nº 1: a bill that only "authorizes" the
// Executive to do what it already may is unconstitutional.
const AUTHORIZING =
  /^autoriza (o poder executivo|o executivo|a uniao|o governo federal|o presidente da republica)\b/;
// Names one municipality. Plural "municípios de" is left out: it is
// usually a national rule ("municípios de pequeno porte").
const LOCAL = /\b(n|d|a)?o municipio de [a-z]/;
// Approval of a radio or TV concession, a routine homologation.
const CONCESSION =
  /^aprova o ato que\b|^aprova .{0,80}\b(concessao|permissao|autorizacao)\b.{0,120}\b(radiodifusao|sons e imagens|televisao|radio)\b/;

// ---------------------------------------------------------------- outcomes

// An attached bill whose principal (or the principal's substitutivo) is
// approved is declared prejudicado and archived, and the bulk file then
// drops its link to the principal. Only the last despacho still names it:
// "Desapensação deste do PL nº 2.307, de 2007, principal, em face da
// aprovação…", "Arquivado… em razão da aprovação do PL 35/2023".
const APPROVED_ELSEWHERE =
  /em face da aprovacao|materia aprovada na forma|em razao da aprovacao|prejudicad[oa].{0,80}aprovacao/;
// "PL nº 2.307, de 2007", "PL 35/2023", "PL-5310/2025", "PL 2.307-A/2007",
// "Projeto de Lei n. 7392/2017".
const REFERENCE_SOURCE =
  "\\b(projeto de lei complementar|projeto de lei|proposta de emenda a constituicao|projeto de decreto legislativo|plp|pl|pec|pdl)[\\s-]*(?:n[o.º°]*\\s*)?(\\d[\\d.]*)(?:-[a-z])?\\s*(?:,?\\s*de\\s*|\\/)\\s*(\\d{4})";
const REFERENCE = new RegExp(REFERENCE_SOURCE);
const REFERENCE_TYPES: Record<string, string> = {
  "projeto de lei complementar": "PLP",
  "projeto de lei": "PL",
  "proposta de emenda a constituicao": "PEC",
  "projeto de decreto legislativo": "PDL",
};

const reference = (match: readonly string[]) => ({
  type: REFERENCE_TYPES[match[1]] ?? match[1].toUpperCase(),
  number: Number(match[2].replaceAll(".", "")),
  year: Number(match[3]),
});
const referenceLabel = (r: { type: string; number: number; year: number }) =>
  `${r.type} ${r.number}/${r.year}`;

/** The approved principal named in an archived bill's despacho, if any. */
export function approvedPrincipal(despacho: string) {
  const text = plain(despacho);
  const match = APPROVED_ELSEWHERE.test(text) && text.match(REFERENCE);
  return match ? reference(match) : null;
}

// --------------------------------------------------------- renumbering

/**
 * A proposition back from the Senate keeps its id but gets a new number,
 * while the bills archived on its approval still cite the old one. Only a
 * proposition numbered in a later year than it was presented can have been
 * renumbered; its official steps are read for the old number. Bills from
 * the Senate keep the Senate's earlier number year and are not renumbered.
 */
export const mayBeRenumbered = (p: { year: number; presentedAt: string }) =>
  p.year > Number(p.presentedAt.slice(0, 4));

// Each step that states a renumbered proposition's own old number, as the
// Câmara writes it. `former` and `about` are the first group of the old
// label and of the label the step is about, when it names one.
const R = REFERENCE_SOURCE;
const STATED: { rule: RegExp; former: number; about?: number; first?: true }[] =
  [
    // "A proposição PL 2148/2015 passou a tramitar como PL 182/2024."
    {
      rule: new RegExp(`a proposicao\\s+${R} passou a tramitar como\\s+${R}`),
      former: 1,
      about: 4,
    },
    // "o Projeto de Lei nº 4.872, de 2024 (PL nº 5.845, de 2016, na Casa
    // de origem)", "(PL n° 2.148, de 2015, nessa Casa)".
    {
      rule: new RegExp(
        `${R}\\s*\\(${R},? (?:na casa de origem|nessa casa|nesta casa)\\)`,
      ),
      former: 4,
      about: 1,
    },
    // "Projeto de Lei nº 2.419-D, de 2021 (Nº anterior: PL 322-D/2015)".
    { rule: new RegExp(`\\bn[o.º°]* anterior:?\\s*${R}`), former: 1 },
    // "A matéria vai ao Senado Federal (PL 2.307-A/2007)."
    {
      rule: new RegExp(`vai ao senado federal\\.?\\s*\\(${R}\\)`),
      former: 1,
    },
    // Its first presentation step: "Apresentação do Projeto de Lei n.
    // 7392/2017, pelo…" (later ones present amendments and substitutes).
    { rule: new RegExp(`^apresentacao d[oa] ${R}`), former: 1, first: true },
  ];

/**
 * The number a renumbered proposition had, as one of its own official steps
 * (`Proposition.steps`) states it (see STATED, in that order): of its own
 * type and numbered in the year it was presented, as the Câmara numbers
 * its bills. A step that only cites a number proves nothing: the most cited
 * one is often a bill attached to it. Null when no step states it.
 */
export function formerLabel(
  p: { type: string; number: number; year: number; presentedAt: string },
  steps: readonly string[],
) {
  const current = `${p.type} ${p.number}/${p.year}`;
  const texts = steps.map(plain);
  const presentation = texts.filter((t) => t.startsWith("apresentacao d"));
  for (const { rule, former, about, first } of STATED)
    for (const text of first ? presentation.slice(0, 1) : texts) {
      const m = text.match(rule);
      if (!m) continue;
      const old = reference(m.slice(former - 1));
      if (
        (about === undefined ||
          referenceLabel(reference(m.slice(about - 1))) === current) &&
        old.type === p.type &&
        String(old.year) === p.presentedAt.slice(0, 4) &&
        referenceLabel(old) !== current
      )
        return referenceLabel(old);
    }
  return null;
}

const CLOSED =
  /Arquivad|Devolvid|Retirad|Perdeu a Eficácia|Prejudicad|Transformad[oa] em nova/i;
/** Whether any rule reads the despacho of a bill in this situation. */
export const readsDespacho = (situation: string) => CLOSED.test(situation);

// Only the official situation text is read; the despacho decides nothing
// but whether an archived bill was rejected.
export function billOutcome(situation: string, despacho: string): BillOutcome {
  if (/Transformad[oa] em (Norma Jurídica|Lei)/i.test(situation)) return "law";
  if (
    /Rejeitad|Vetad[oa] totalmente/i.test(situation) ||
    (/Arquivad/i.test(situation) && /rejei/i.test(despacho))
  )
    return "rejected";
  if (
    /Senado Federal|Sanção|Promulgação|Autógrafos|Redação Final/i.test(
      situation,
    )
  )
    return "approved";
  if (CLOSED.test(situation)) return "closed";
  return "active";
}

// ---------------------------------------------------------------- input

export type Proposition = {
  id: number;
  type: string;
  number: number;
  year: number;
  ementa: string;
  /** YYYY-MM-DD. */
  presentedAt: string;
  situation: string | null;
  /** Kept only when `readsDespacho(situation)`; null otherwise. */
  despacho: string | null;
  /** The Câmara lists a rapporteur in the last status. */
  relator: boolean;
  /** Deputies who signed as proponents, any order. */
  proponents: number[];
  /** First signer when a deputy, else null. */
  first: number | null;
  /**
   * Despachos of its official steps, in order, kept only when
   * `mayBeRenumbered`; empty otherwise. Read by `formerLabel`.
   */
  steps: string[];
};
/** Rapporteur opinions, committee opinions and final texts of a principal. */
export type Document = {
  id: number;
  principal: number;
  type: string;
  /** Kept only for the opinion types read by FAVORABLE; empty otherwise. */
  ementa: string;
  /** Deputies who signed a rapporteur report; empty for other types. */
  authors: number[];
};
export type QualityInput = {
  version: typeof QUALITY_VERSION;
  /** Reference date of the collection, YYYY-MM-DD (São Paulo). */
  asOf: string;
  /** Start of the legislature: bills presented since then are scored. */
  since: string;
  /** Deputies in office: the leaderboard. */
  deputies: number[];
  /** Every bill of the bulk years, plus principals read from the API. */
  propositions: Proposition[];
  documents: Document[];
};

// ---------------------------------------------------------------- constants

export const BILL_TYPES = ["PL", "PLP", "PEC", "PDL"];
/** Legal reach of the norm: constitution > complementary law > law. */
export const REACH: Record<string, number> = {
  PEC: 3,
  PLP: 2,
  PL: 1,
  PDL: 1,
  MPV: 1,
};
/** Weight of honorific, authorizing and concession bills. */
export const LOW = 0.1;
/** Multiplier for a bill that names one municipality. */
export const LOCAL_FACTOR = 0.3;
/** Author points by the furthest stage; via points are shared, see below. */
export const POINTS = { law: 10, camara: 4, lawVia: 5, approvedVia: 2 };
/** Rapporteur points, shared among the principal's rapporteurs. */
export const REPORT_POINTS = { law: 4, camara: 2 };
/** Near-copy: same type, same numbers cited, ≥ 90% of the content words. */
export const COPY_SIMILARITY = 0.9;

export const REPORT_TYPES = [
  "PRL",
  "PRLP",
  "PRLE",
  "PPP",
  "PEP",
  "PPR",
  "PRV",
  "CVO",
];
const FAVORABLE_TYPES = ["PRL", "PPP", "PRV"];
export const DOCUMENT_TYPES = [...REPORT_TYPES, "PAR", "SBT-A", "RDF", "PARF"];
export const keepsEmenta = (type: string) => FAVORABLE_TYPES.includes(type);
const FAVORABLE = /pela (aprovacao|admissibilidade)/;
const CAMARA_SITUATION =
  /Senado Federal|Sanção|Veto|Vetad|Promulgação|Autógrafos|Redação Final/i;
const RAPPORTEUR_SITUATION =
  /Aguardando Parecer|Pronta para Pauta|Aguardando Vistas|Aguardando Deliberação|Aguardando Devolução/i;
// "Altera a Lei X, que dispõe sobre…" with no purpose: two such ementas
// can hide different texts, so they are never called copies.
const GENERIC =
  /^altera\b(?!.*\b(para|a fim de|com o objetivo|com a finalidade|de modo a|visando|no tocante|quanto a)\b)/;
const STOP = new Set(
  "para sobre como pela pelo pelos pelas dispoe altera institui outras providencias dezembro janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro decreto".split(
    " ",
  ),
);

export const STAGES: readonly QualityStage[] = [
  "presented",
  "rapporteur",
  "opinion",
  "committee",
  "camara",
  "law",
];

// Fixed alternative weightings. Each deputy's rank range is the lowest and
// highest rank over all of them, so a reader sees how much the position
// depends on choices that are conventions.
type Config = {
  reach: Record<string, number>;
  low: number;
  local: number;
  points: typeof POINTS;
  reports: typeof REPORT_POINTS;
  firstOnly: boolean;
};
const BASE: Config = {
  reach: REACH,
  low: LOW,
  local: LOCAL_FACTOR,
  points: POINTS,
  reports: REPORT_POINTS,
  firstOnly: false,
};
export const VARIANTS: readonly {
  key: string;
  label: string;
  config: Config;
}[] = [
  { key: "base", label: "Pesos oficiais desta metodologia", config: BASE },
  {
    key: "flatReach",
    label: "PEC, PLP e PL com o mesmo peso",
    config: { ...BASE, reach: { PEC: 1, PLP: 1, PL: 1, PDL: 1, MPV: 1 } },
  },
  {
    key: "steepReach",
    label: "PEC 5, PLP 3, PL 1",
    config: { ...BASE, reach: { PEC: 5, PLP: 3, PL: 1, PDL: 1, MPV: 1 } },
  },
  {
    key: "lowZero",
    label: "Honoríficos, autorizativos e locais valem zero",
    config: { ...BASE, low: 0, local: 0 },
  },
  {
    key: "lowHalf",
    label: "Honoríficos e autorizativos valem 0,5; locais 0,6",
    config: { ...BASE, low: 0.5, local: 0.6 },
  },
  {
    key: "lawHeavy",
    label: "Lei vale 20; aprovação na Câmara 3",
    config: {
      ...BASE,
      points: { law: 20, camara: 3, lawVia: 8, approvedVia: 1 },
    },
  },
  {
    key: "flatStage",
    label: "Lei vale 5; aprovação na Câmara 4",
    config: {
      ...BASE,
      points: { law: 5, camara: 4, lawVia: 3, approvedVia: 2 },
    },
  },
  {
    key: "noVia",
    label: "Sem crédito por outro projeto",
    config: { ...BASE, points: { ...POINTS, lawVia: 0, approvedVia: 0 } },
  },
  {
    key: "firstOnly",
    label: "Só o primeiro autor recebe crédito",
    config: { ...BASE, firstOnly: true },
  },
  {
    key: "noReports",
    label: "Sem relatorias",
    config: { ...BASE, reports: { law: 0, camara: 0 } },
  },
  {
    key: "doubleReports",
    label: "Relatorias com peso dobrado",
    config: { ...BASE, reports: { law: 8, camara: 4 } },
  },
];

// ---------------------------------------------------------------- scoring

export type BillResult = {
  id: number;
  outcome: BillOutcome;
  kind: BillKind;
  /** `cited`: the label the despacho names, older when renumbered. */
  via: {
    id: number;
    label: string;
    cited: string;
    situation: string | null;
  } | null;
  stage: QualityStage;
  weight: number;
  reasons: QualityReason[];
  copyOf: { id: number; label: string } | null;
  /**
   * Base weights: points of the stage, or of the principal for bills
   * approved through it, divided by the bills sharing that principal (pool,
   * 1 otherwise). Each proponent gets `share` = weight × base ÷ pool ÷
   * proponents, rounded to cents.
   */
  base: number;
  pool: number;
  share: number;
  /** Deputies sharing the points; the same list for every rule. */
  credited: number[];
};
export type ReportResult = {
  id: number;
  label: string;
  stage: QualityStage;
  weight: number;
  base: number;
  /** weight × base ÷ rapporteurs, rounded to cents. */
  share: number;
  rapporteurs: number[];
};
export type DeputyResult = {
  id: number;
  points: number;
  authorPoints: number;
  reportPoints: number;
  rank: number;
  rankRange: [number, number];
};
export type QualityResult = {
  version: typeof QUALITY_VERSION;
  asOf: string;
  /**
   * Principals named by archived bills ("em face da aprovação do PL…") that
   * no official source identifies; those bills stay archived.
   */
  unresolvedPrincipals: { label: string; bills: number }[];
  bills: BillResult[];
  reports: ReportResult[];
  deputies: DeputyResult[];
};

const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
const ascending = (a: number, b: number) => a - b;
const unique = (values: readonly number[]) =>
  [...new Set(values)].sort(ascending);
const label = (p: Proposition) => `${p.type} ${p.number}/${p.year}`;
// Two decimals, once, after summing in a fixed order.
const round = (value: number) => Math.round(value * 100) / 100;

const numbers = (ementa: string) =>
  [...new Set(ementa.replace(/(\d)\.(\d)/g, "$1$2").match(/\d+/g) ?? [])]
    .sort()
    .join(",");
const words = (text: string) =>
  new Set(
    text
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
function jaccard(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

// The earliest bill each bill copies, by (presentedAt, id). Candidates
// share at least two of each other's four rarest words; rarity ties are
// broken alphabetically, so the candidate set is fixed by the corpus.
function findCopies(propositions: readonly Proposition[]) {
  const ordered = propositions
    .filter((p) => BILL_TYPES.includes(p.type))
    .toSorted(
      (a, b) =>
        (a.presentedAt < b.presentedAt
          ? -1
          : a.presentedAt > b.presentedAt
            ? 1
            : 0) || a.id - b.id,
    );
  const texts = ordered.map((p) => plain(p.ementa));
  const sets = texts.map(words);
  const frequency = new Map<string, number>();
  for (const set of sets)
    for (const w of set) frequency.set(w, (frequency.get(w) ?? 0) + 1);
  const index = new Map<string, number[]>();
  const copies = new Map<number, Proposition>();
  ordered.forEach((p, i) => {
    const set = sets[i];
    if (set.size < 4) return;
    const rare = [...set]
      .sort(
        (a, b) =>
          frequency.get(a)! - frequency.get(b)! || (a < b ? -1 : a > b ? 1 : 0),
      )
      .slice(0, 4);
    if (!GENERIC.test(texts[i])) {
      const shared = new Map<number, number>();
      for (const w of rare)
        for (const j of index.get(w) ?? [])
          shared.set(j, (shared.get(j) ?? 0) + 1);
      let best: { j: number; similarity: number } | null = null;
      for (const [j, count] of [...shared].sort((a, b) => a[0] - b[0])) {
        const other = ordered[j];
        if (
          count < 2 ||
          other.type !== p.type ||
          GENERIC.test(texts[j]) ||
          numbers(other.ementa) !== numbers(p.ementa)
        )
          continue;
        const similarity = jaccard(set, sets[j]);
        if (
          similarity >= COPY_SIMILARITY &&
          (!best || similarity > best.similarity)
        )
          best = { j, similarity };
      }
      if (best) copies.set(p.id, ordered[best.j]);
    }
    for (const w of rare) {
      const list = index.get(w) ?? [];
      list.push(i);
      index.set(w, list);
    }
  });
  return copies;
}

function stageOf(
  p: Proposition,
  outcome: BillOutcome,
  documents: readonly Document[],
): QualityStage {
  const has = (types: readonly string[]) =>
    documents.some((d) => types.includes(d.type));
  const favorable = documents.some(
    (d) => keepsEmenta(d.type) && FAVORABLE.test(plain(d.ementa)),
  );
  const situation = p.situation ?? "";
  if (outcome === "law") return "law";
  if (
    outcome === "approved" ||
    CAMARA_SITUATION.test(situation) ||
    has(["RDF", "PARF"])
  )
    return "camara";
  if (has(["SBT-A"]) || (has(["PAR"]) && favorable)) return "committee";
  if (has([...REPORT_TYPES, "PAR"]) || /Pronta para Pauta/i.test(situation))
    return "opinion";
  if (p.relator || RAPPORTEUR_SITUATION.test(situation)) return "rapporteur";
  return "presented";
}

function reasonsOf(
  p: Proposition,
  kind: BillKind,
  copy: boolean,
): QualityReason[] {
  const text = plain(p.ementa);
  const reasons: QualityReason[] = [];
  if (kind === "honorific") reasons.push("honorific");
  else if (AUTHORIZING.test(text)) reasons.push("authorizing");
  else if (p.type === "PDL" && CONCESSION.test(text))
    reasons.push("concession");
  else if (LOCAL.test(text)) reasons.push("local");
  if (copy) reasons.push("copy");
  if (/Devolvid/i.test(p.situation ?? "")) reasons.push("returned");
  return reasons;
}

function weightOf(type: string, reasons: readonly QualityReason[], c: Config) {
  if (reasons.includes("copy") || reasons.includes("returned")) return 0;
  if (
    reasons.some(
      (r) => r === "honorific" || r === "authorizing" || r === "concession",
    )
  )
    return c.low;
  const reach = c.reach[type] ?? 0;
  return reasons.includes("local") ? reach * c.local : reach;
}

const stagePoints = (
  stage: QualityStage,
  p: { law: number; camara: number },
) => (stage === "law" ? p.law : stage === "camara" ? p.camara : 0);

export function scoreQuality(input: QualityInput): QualityResult {
  if (input.version !== QUALITY_VERSION)
    throw new Error(`Entrada de qualidade na versão ${input.version}`);
  const propositions = input.propositions.toSorted(byId);
  const documents = input.documents.toSorted(byId);
  for (const list of [propositions, documents])
    for (let i = 1; i < list.length; i++)
      if (list[i].id === list[i - 1].id)
        throw new Error(`ID repetido na entrada de qualidade: ${list[i].id}`);
  const deputies = unique(input.deputies);

  const proposition = new Map(propositions.map((p) => [p.id, p]));
  // Former labels first, so a current label always wins a collision.
  const byNumber = new Map<string, Proposition>();
  for (const p of propositions) {
    const former = mayBeRenumbered(p) ? formerLabel(p, p.steps) : null;
    if (former) byNumber.set(former, p);
  }
  for (const p of propositions) byNumber.set(label(p), p);
  const docsOf = new Map<number, Document[]>();
  for (const d of documents) {
    const list = docsOf.get(d.principal) ?? [];
    list.push(d);
    docsOf.set(d.principal, list);
  }
  const copies = findCopies(propositions);
  const outcomeOf = (p: Proposition) =>
    billOutcome(p.situation ?? "", p.despacho ?? "");

  const bills: BillResult[] = [];
  const unresolved = new Map<string, number>();
  for (const p of propositions) {
    if (
      !BILL_TYPES.includes(p.type) ||
      p.presentedAt < input.since ||
      !p.proponents.length
    )
      continue;
    let outcome = outcomeOf(p);
    let via: BillResult["via"] = null;
    const named =
      outcome === "closed" ? approvedPrincipal(p.despacho ?? "") : null;
    const cited = named ? referenceLabel(named) : null;
    const principal = cited ? byNumber.get(cited) : undefined;
    if (cited && !principal)
      unresolved.set(cited, (unresolved.get(cited) ?? 0) + 1);
    if (cited && principal && principal.id !== p.id) {
      // Approved by the same ladder as any bill: a final text or a veto
      // counts, not only the situation text.
      const principalStage = stageOf(
        principal,
        outcomeOf(principal),
        docsOf.get(principal.id) ?? [],
      );
      if (principalStage === "law" || principalStage === "camara") {
        outcome = principalStage === "law" ? "lawVia" : "approvedVia";
        via = {
          id: principal.id,
          label: label(principal),
          cited,
          situation: principal.situation,
        };
      }
    }
    const kind = billKind(p.type, p.ementa);
    const copy = copies.get(p.id);
    const reasons = reasonsOf(p, kind, Boolean(copy));
    bills.push({
      id: p.id,
      outcome,
      kind,
      via,
      stage: stageOf(p, outcome, docsOf.get(p.id) ?? []),
      weight: weightOf(p.type, reasons, BASE),
      reasons,
      copyOf: copy ? { id: copy.id, label: label(copy) } : null,
      base: 0,
      pool: 1,
      share: 0,
      credited: unique(p.proponents),
    });
  }
  // Bills archived when one principal was approved share its via points.
  const pools = new Map<number, number>();
  for (const b of bills)
    if (b.via) pools.set(b.via.id, (pools.get(b.via.id) ?? 0) + 1);

  const reports: ReportResult[] = [];
  for (const [id, list] of [...docsOf].sort((a, b) => a[0] - b[0])) {
    const rapporteurs = unique(
      list
        .filter((d) => REPORT_TYPES.includes(d.type))
        .flatMap((d) => d.authors),
    );
    if (!rapporteurs.length) continue;
    const p = proposition.get(id);
    if (!p || !(p.type in REACH)) continue;
    const stage = stageOf(p, outcomeOf(p), list);
    if (stage !== "law" && stage !== "camara") continue;
    const reasons = reasonsOf(p, billKind(p.type, p.ementa), false);
    reports.push({
      id,
      label: label(p),
      stage,
      weight: weightOf(p.type, reasons, BASE),
      base: 0,
      share: 0,
      rapporteurs,
    });
  }

  const reasonsById = new Map(bills.map((b) => [b.id, b.reasons]));
  const typeOf = (id: number) => proposition.get(id)!.type;
  const firstOf = (id: number) => proposition.get(id)!.first;
  const billFactors = (b: BillResult, c: Config) => {
    const weight = weightOf(typeOf(b.id), reasonsById.get(b.id)!, c);
    const own = stagePoints(b.stage, c.points);
    if (b.via) {
      const via =
        b.outcome === "lawVia" ? c.points.lawVia : c.points.approvedVia;
      const pool = pools.get(b.via.id)!;
      if (via / pool > own) return { weight, base: via, pool };
    }
    return { weight, base: own, pool: 1 };
  };
  const reportFactors = (r: ReportResult, c: Config) => {
    const p = proposition.get(r.id)!;
    const reasons = reasonsOf(p, billKind(p.type, p.ementa), false);
    return {
      weight: weightOf(p.type, reasons, c),
      base: stagePoints(r.stage, c.reports),
      pool: 1,
    };
  };
  // Every share is rounded to cents, and a deputy's points are the exact
  // sum of the shares the site lists, so anyone can add them up by hand.
  const share = (
    f: { weight: number; base: number; pool: number },
    people: number,
  ) => round((f.weight * f.base) / f.pool / people);
  const totals = (c: Config) => {
    const author = new Map<number, number>();
    const report = new Map<number, number>();
    for (const b of bills) {
      const first = firstOf(b.id);
      const ids = c.firstOnly ? (first === null ? [] : [first]) : b.credited;
      const value = share(billFactors(b, c), ids.length);
      if (value)
        for (const id of ids)
          author.set(id, round((author.get(id) ?? 0) + value));
    }
    for (const r of reports) {
      const value = share(reportFactors(r, c), r.rapporteurs.length);
      if (value)
        for (const id of r.rapporteurs)
          report.set(id, round((report.get(id) ?? 0) + value));
    }
    return { author, report };
  };
  // Competition ranking ("1, 2, 2, 4") on rounded points.
  const ranks = (score: Map<number, number>) => {
    const values = deputies.map((id) => score.get(id) ?? 0);
    return new Map(
      deputies.map((id, i) => [
        id,
        1 + values.filter((v) => v > values[i]).length,
      ]),
    );
  };

  for (const b of bills) {
    const f = billFactors(b, BASE);
    b.base = f.base;
    b.pool = f.pool;
    b.share = share(f, b.credited.length);
  }
  for (const r of reports) {
    const f = reportFactors(r, BASE);
    r.base = f.base;
    r.share = share(f, r.rapporteurs.length);
  }
  const variantRanks = VARIANTS.map(({ config }) => {
    const { author, report } = totals(config);
    return ranks(
      new Map(
        deputies.map((id) => [
          id,
          round((author.get(id) ?? 0) + (report.get(id) ?? 0)),
        ]),
      ),
    );
  });
  const base = totals(BASE);
  return {
    version: QUALITY_VERSION,
    asOf: input.asOf,
    unresolvedPrincipals: [...unresolved]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([label, bills]) => ({ label, bills })),
    bills,
    reports,
    deputies: deputies.map((id) => {
      const authorPoints = base.author.get(id) ?? 0;
      const reportPoints = base.report.get(id) ?? 0;
      const all = variantRanks.map((r) => r.get(id)!);
      return {
        id,
        points: round(authorPoints + reportPoints),
        authorPoints,
        reportPoints,
        rank: variantRanks[0].get(id)!,
        rankRange: [Math.min(...all), Math.max(...all)],
      };
    }),
  };
}
