import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCompact } from "../scripts/pipeline/content.ts";
import { QUALITY_VERSION, scoreQuality } from "../scripts/pipeline/quality.ts";

const WORDS =
  "abacaxi banana cajueiro damasco embauba figueira goiaba hortela ingazeiro jabuticaba";
const prop = (id, fields) => ({
  id,
  type: "PL",
  number: id,
  year: 2024,
  ementa: `Ementa própria número ${id} sobre tema único`,
  presentedAt: "2024-03-01",
  situation: "Aguardando Designação de Relator(a)",
  despacho: null,
  relator: false,
  proponents: [],
  first: null,
  steps: [],
  ...fields,
});
const LAW = "Transformado em Norma Jurídica";
const ARCHIVED = {
  situation: "Arquivada",
  despacho:
    "Arquivado em razão da aprovação do PL 50/2015, principal, ao qual estava apensado.",
};

function input() {
  return {
    version: QUALITY_VERSION,
    asOf: "2026-11-08",
    since: "2023-02-01",
    deputies: [1, 2, 3, 4],
    propositions: [
      // Law with two proponents: 10 points shared, 5 each.
      prop(10, { situation: LAW, proponents: [2, 1], first: 1 }),
      // Honorific law: weight 0.1, 1 point.
      prop(11, {
        ementa: "Institui o Dia Nacional do Cajueiro.",
        situation: LAW,
        proponents: [3],
        first: 3,
      }),
      // PEC approved by the Câmara: reach 3 × 4 points.
      prop(12, {
        type: "PEC",
        situation: "Aguardando Apreciação pelo Senado Federal",
        proponents: [4],
        first: 4,
      }),
      // Local law: 10 × 0.3.
      prop(13, {
        ementa: "Cria o campus federal no município de Exemplópolis.",
        situation: LAW,
        proponents: [4],
        first: 4,
      }),
      // The original has the larger id but was presented first.
      prop(40, {
        ementa: WORDS,
        presentedAt: "2023-05-01",
        situation: LAW,
        proponents: [3],
        first: 3,
      }),
      // Nine of the original's ten words: similarity exactly 0.9, a copy.
      prop(30, {
        ementa: WORDS.split(" ").slice(0, 9).join(" "),
        presentedAt: "2023-06-01",
        situation: LAW,
        proponents: [3],
        first: 3,
      }),
      // Eight of ten (0.8): not a copy.
      prop(31, {
        ementa: WORDS.split(" ").slice(0, 8).join(" "),
        presentedAt: "2023-07-01",
        proponents: [2],
        first: 2,
      }),
      // Same words, another number cited: not a copy.
      prop(32, {
        ementa: `${WORDS} 2024`,
        presentedAt: "2023-08-01",
        proponents: [2],
        first: 2,
      }),
      // Generic ementas are never copies, however equal.
      prop(33, {
        ementa:
          "Altera a Lei nº 1.234, de 2001, que dispõe sobre armamento, cadastro, munições e fiscalização.",
        presentedAt: "2023-09-01",
        proponents: [2],
        first: 2,
      }),
      prop(34, {
        ementa:
          "Altera a Lei nº 1.234, de 2001, que dispõe sobre armamento, cadastro, munições e fiscalização.",
        presentedAt: "2023-10-01",
        proponents: [2],
        first: 2,
      }),
      // Two bills archived when PL 50/2015 became law share its 5 points.
      prop(20, { ...ARCHIVED, proponents: [1], first: 1 }),
      prop(21, { ...ARCHIVED, proponents: [2], first: 2 }),
      // The principal, older than the legislature: never scored as a bill.
      prop(50, {
        number: 50,
        year: 2015,
        presentedAt: "2015-04-01",
        situation: LAW,
      }),
      // Reported by deputies 1 and 2 and approved by the Câmara.
      prop(60, {
        presentedAt: "2015-04-01",
        situation: "Aguardando Apreciação pelo Senado Federal",
      }),
      // Reported but not approved: no points.
      prop(61, { presentedAt: "2015-04-01", situation: "Pronta para Pauta" }),
    ],
    documents: [
      { id: 900, principal: 60, type: "PRL", ementa: "Parecer", authors: [1] },
      { id: 901, principal: 60, type: "PPP", ementa: "Parecer", authors: [2] },
      { id: 902, principal: 61, type: "PRL", ementa: "Parecer", authors: [3] },
      // A committee opinion is not a rapporteurship.
      { id: 903, principal: 60, type: "PAR", ementa: "", authors: [4] },
    ],
  };
}

const shuffled = (value) => {
  const copy = structuredClone(value);
  copy.propositions.reverse();
  copy.documents.reverse();
  copy.deputies.reverse();
  for (const p of copy.propositions) p.proponents.reverse();
  return copy;
};

test("Scores are byte-identical for the same input in any order", () => {
  const first = encodeCompact(scoreQuality(input()));
  assert.equal(encodeCompact(scoreQuality(input())), first);
  assert.equal(encodeCompact(scoreQuality(shuffled(input()))), first);
});

test("Quality points follow the published weights, copies and shares", () => {
  const result = scoreQuality(input());
  const bill = new Map(result.bills.map((b) => [b.id, b]));
  // [weight, base points, pool, share per proponent]
  const pick = (id) => {
    const { weight, base, pool, share, reasons, copyOf, outcome } =
      bill.get(id);
    return {
      calc: [weight, base, pool, share],
      reasons,
      copyOf: copyOf?.id ?? null,
      outcome,
    };
  };
  const expected = {
    10: { calc: [1, 10, 1, 5], reasons: [], copyOf: null, outcome: "law" },
    11: {
      calc: [0.1, 10, 1, 1],
      reasons: ["honorific"],
      copyOf: null,
      outcome: "law",
    },
    12: { calc: [3, 4, 1, 12], reasons: [], copyOf: null, outcome: "approved" },
    13: {
      calc: [0.3, 10, 1, 3],
      reasons: ["local"],
      copyOf: null,
      outcome: "law",
    },
    40: { calc: [1, 10, 1, 10], reasons: [], copyOf: null, outcome: "law" },
    30: { calc: [0, 10, 1, 0], reasons: ["copy"], copyOf: 40, outcome: "law" },
    20: { calc: [1, 5, 2, 2.5], reasons: [], copyOf: null, outcome: "lawVia" },
  };
  for (const [id, value] of Object.entries(expected))
    assert.deepEqual(pick(Number(id)), value, `bill ${id}`);
  for (const id of [31, 32, 33, 34])
    assert.equal(bill.get(id).copyOf, null, `bill ${id}`);
  assert.equal(bill.has(50), false);
  assert.deepEqual(
    result.reports.map(({ id, weight, base, share, rapporteurs }) => ({
      id,
      calc: [weight, base, share],
      rapporteurs,
    })),
    [{ id: 60, calc: [1, 2, 1], rapporteurs: [1, 2] }],
  );

  const deputy = new Map(result.deputies.map((d) => [d.id, d]));
  // 1: half of PL 10 (5) + half of the via pool (2.5) + half of a report (1).
  assert.deepEqual(
    [1, 2, 3, 4].map((id) => {
      const { points, authorPoints, reportPoints, rank } = deputy.get(id);
      return { id, points, authorPoints, reportPoints, rank };
    }),
    [
      { id: 1, points: 8.5, authorPoints: 7.5, reportPoints: 1, rank: 3 },
      { id: 2, points: 8.5, authorPoints: 7.5, reportPoints: 1, rank: 3 },
      { id: 3, points: 11, authorPoints: 11, reportPoints: 0, rank: 2 },
      { id: 4, points: 15, authorPoints: 15, reportPoints: 0, rank: 1 },
    ],
  );
  // Only the first author is credited in one variant: deputy 2 loses PL 10.
  assert.deepEqual(deputy.get(2).rankRange, [2, 4]);
});

test("A deputy's points are the exact sum of the shares the site lists", () => {
  // Two laws with three proponents: 10 ÷ 3 = 3.33 each. Summing before
  // rounding would give 6.67; the listed shares add up to 6.66.
  const value = input();
  for (const [id, topic] of [
    [70, "saneamento básico"],
    [71, "iluminação pública"],
  ])
    value.propositions.push({
      ...value.propositions[0],
      id,
      number: id,
      ementa: `Ementa distinta com três autores sobre ${topic}`,
      proponents: [1, 2, 3],
      first: 1,
    });
  const result = scoreQuality(value);
  for (const d of result.deputies) {
    const shares = [
      ...result.bills.filter((b) => b.credited.includes(d.id)),
      ...result.reports.filter((r) => r.rapporteurs.includes(d.id)),
    ].reduce((sum, item) => sum + Math.round(item.share * 100), 0);
    assert.equal(Math.round(d.points * 100), shares, `deputy ${d.id}`);
  }
  assert.equal(result.bills.find((b) => b.id === 70).share, 3.33);
});

test("Archived bills reach a renumbered or final-text principal", () => {
  const value = input();
  const archived = (id, despacho) =>
    prop(id, { situation: "Arquivada", despacho, proponents: [1], first: 1 });
  value.propositions.push(
    // Back from the Senate with a new number, stated in a notice.
    prop(80, {
      number: 182,
      year: 2024,
      presentedAt: "2015-06-30",
      situation: LAW,
      steps: [
        "Apresentação do PL n. 2148/2015 (Projeto de Lei), pelo Deputado X.",
        "A proposição  PL 2148/2015 passou a tramitar como PL 182/2024.",
      ],
    }),
    archived(
      81,
      "Arquivado em face da aprovação, em Plenário, da Subemenda Substitutiva Global ao Projeto de Lei nº 2.148, de 2015.",
    ),
    // Renumbered with no notice: the step sending it to the Senate states
    // its old number. A notice about another proposition, and an attached
    // bill cited more often than the old number, are not evidence.
    prop(82, {
      number: 5807,
      year: 2025,
      presentedAt: "2007-10-30",
      situation: "Aguardando Apreciação pelo Senado Federal",
      steps: [
        "Apresentação do Projeto de Lei pelo Deputado Y.",
        "A proposição PL 2546/2007 passou a tramitar como PL 77/2025.",
        "Apense-se a este(a) o(a) PL-2546/2007.",
        "Parecer do Relator pela aprovação deste e do PL 2546/2007, apensado.",
        "Recebimento pela CCJC, com as proposições PL-2546/2007 apensadas.",
        "A matéria vai ao Senado Federal (PL 2.307-A/2007).",
      ],
    }),
    archived(
      83,
      "Desapensação deste do PL nº 2.307, de 2007, principal, em face da aprovação da matéria.",
    ),
    // Approved by the Câmara only by its final text, not its situation.
    prop(84, {
      number: 5122,
      year: 2023,
      presentedAt: "2023-10-01",
      situation: "Apresentação de Requerimento",
    }),
    archived(
      85,
      "Arquivado em face da aprovação, em Plenário, do Substitutivo ao PL 5122/2023.",
    ),
    // Only its presentation step, spelled out, states the old number.
    prop(89, {
      number: 1533,
      year: 2023,
      presentedAt: "2017-04-11",
      situation: LAW,
      steps: [
        "Apresentação do Projeto de Lei n. 7392/2017, pelo Deputado Z.",
        "Apense-se a este(a) o(a) PL-7394/2017.",
        "Parecer pela aprovação deste e pela rejeição do PL 7394/2017.",
      ],
    }),
    archived(90, "Arquivado em face da aprovação do PL 7392/2017."),
    archived(91, "Arquivado em face da aprovação do PL 7394/2017."),
    // A principal no source identifies.
    archived(86, "Arquivado em razão da aprovação do PL 9999/2001."),
    // From the Senate, numbered there before reaching the Câmara: never
    // renumbered, so its steps are not read.
    prop(87, {
      number: 87,
      year: 2020,
      presentedAt: "2024-01-10",
      situation: LAW,
      steps: ["A matéria vai ao Senado Federal (PL 1/2024)."],
    }),
    archived(88, "Arquivado em razão da aprovação do PL 1/2024."),
  );
  value.documents.push({
    id: 910,
    principal: 84,
    type: "RDF",
    ementa: "",
    authors: [],
  });
  const result = scoreQuality(value);
  const bill = new Map(result.bills.map((b) => [b.id, b]));
  assert.deepEqual(
    [81, 83, 85, 86, 88, 90, 91].map((id) => {
      const { outcome, via, share } = bill.get(id);
      return { id, outcome, via: via && [via.id, via.cited], share };
    }),
    [
      { id: 81, outcome: "lawVia", via: [80, "PL 2148/2015"], share: 5 },
      { id: 83, outcome: "approvedVia", via: [82, "PL 2307/2007"], share: 2 },
      { id: 85, outcome: "approvedVia", via: [84, "PL 5122/2023"], share: 2 },
      { id: 86, outcome: "closed", via: null, share: 0 },
      { id: 88, outcome: "closed", via: null, share: 0 },
      { id: 90, outcome: "lawVia", via: [89, "PL 7392/2017"], share: 5 },
      { id: 91, outcome: "closed", via: null, share: 0 },
    ],
  );
  assert.deepEqual(result.unresolvedPrincipals, [
    { label: "PL 1/2024", bills: 1 },
    { label: "PL 7394/2017", bills: 1 },
    { label: "PL 9999/2001", bills: 1 },
  ]);
});
