import { test } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { pendingYears, publishedYear } from "../scripts/metrics.ts";

// Four bronze.arquivos rows, given out of order. Their lote is the SHA-256 of
// the sorted "arquivo:sha256" lines, computed with sha256sum.
const LOTE = "20d4c72a61479583aef135ba8d1cf73c55287370d043fcfd24b585db5c96e209";
const fontes = [
  { ano: 2026, arquivo: "votacoesVotos.json", sha256: "2222", bytes: 1 },
  { ano: 2026, arquivo: "votacoes.json", sha256: "1111", bytes: 2 },
  { ano: 2026, arquivo: "proposicoesAutores.json", sha256: "4444", bytes: 3 },
  { ano: 2026, arquivo: "votacoesProposicoes.json", sha256: "3333", bytes: 4 },
];
const lake = {
  lote: LOTE,
  alinhamento: [
    { bloco: "Oposição", partido: "PP", votos: 4, alinhados: 1 },
    { bloco: "Governo", partido: "AAA", votos: 3, alinhados: 2 },
    // A bloco outside BLOCS is not published.
    { bloco: "Desconhecido", partido: "ZZZ", votos: 9, alinhados: 9 },
    { bloco: "Governo", partido: "BBB", votos: 1, alinhados: 1 },
  ],
  deputados: [
    {
      deputado: 2,
      orgao: "PLEN",
      voto: "Sim",
      votos: 1,
      com_orientacao_governo: true,
      alinhados_governo: true,
    },
    {
      deputado: 10,
      orgao: "CCJC",
      voto: "Não",
      votos: 2,
      com_orientacao_governo: false,
      alinhados_governo: 0,
    },
    {
      deputado: 2,
      orgao: "CCJC",
      voto: "Sim",
      votos: 1,
      com_orientacao_governo: null,
      alinhados_governo: null,
    },
  ],
  votacoes: [
    { mes: "2026-01", votacoes: 5, nominais: 3, plenario: 2 },
    { mes: "2026-02", votacoes: 1, nominais: 0, plenario: 0 },
  ],
  fontes,
};
const CALCULADO = "2026-11-05T12:00:00.000Z";

test("a year's lake rows become the four published files, in BLOCS order", async () => {
  const files = await Effect.runPromise(publishedYear(2026, lake, CALCULADO));
  assert.deepEqual(files, {
    alinhamento: {
      ano: 2026,
      calculado_em: CALCULADO,
      bancadas: {
        Governo: [
          { partido: "AAA", votos: 3, alinhados: 2 },
          { partido: "BBB", votos: 1, alinhados: 1 },
        ],
        Oposição: [{ partido: "PP", votos: 4, alinhados: 1 }],
        Maioria: [],
        Minoria: [],
      },
    },
    deputados: {
      ano: 2026,
      calculado_em: CALCULADO,
      deputados: {
        2: [
          {
            orgao: "PLEN",
            voto: "Sim",
            votos: 1,
            com_orientacao_governo: true,
            alinhados_governo: true,
          },
          {
            orgao: "CCJC",
            voto: "Sim",
            votos: 1,
            com_orientacao_governo: null,
            alinhados_governo: null,
          },
        ],
        10: [
          {
            orgao: "CCJC",
            voto: "Não",
            votos: 2,
            com_orientacao_governo: false,
            alinhados_governo: 0,
          },
        ],
      },
    },
    votacoes: {
      ano: 2026,
      calculado_em: CALCULADO,
      linhas: lake.votacoes,
    },
    fontes: {
      ano: 2026,
      calculado_em: CALCULADO,
      linhas: fontes,
    },
  });
});

test("a batch whose fontes do not hash to lote is rejected, as is a batch with three files", async () => {
  const wrongLote = { ...lake, lote: LOTE.replace(/^./, "0") };
  const error = await Effect.runPromise(
    Effect.flip(publishedYear(2026, wrongLote, CALCULADO)),
  );
  assert.equal(error._tag, "MetricsError");
  assert.match(error.message, /2026/);

  const threeFiles = { ...lake, fontes: fontes.slice(1) };
  await assert.rejects(
    Effect.runPromise(publishedYear(2026, threeFiles, CALCULADO)),
  );
});

test("only years whose lote differs from the index are published, newest first", () => {
  const index = {
    anos: {
      2024: { fingerprint: "a", calculado_em: CALCULADO },
      2025: { fingerprint: "b", calculado_em: CALCULADO },
      2026: { fingerprint: "old", calculado_em: CALCULADO },
    },
  };
  const years = [
    { ano: 2023, lote: "c" },
    { ano: 2024, lote: "a" },
    { ano: 2025, lote: "b" },
    { ano: 2026, lote: "new" },
    { ano: 2022, lote: "d" },
  ];
  assert.deepEqual(
    pendingYears(index, years).map((y) => y.ano),
    [2026, 2023, 2022],
  );
});
