// Shared by the Worker (serving) and scripts/metrics.ts (precomputing).
// No runtime-specific APIs here.

export const FIRST_YEAR = 2003;
export const PREFIX = "metricas/v1";

// Leaderships that orient on most Plenary votes; the lake (lake/src/camara.rs) unifies their
// spellings in `bloco`. Parties often orient through federations or blocs with
// truncated names, so a party-to-own-orientation join would silently miss them.
export const BLOCS = ["Governo", "Oposição", "Maioria", "Minoria"] as const;

export const DEFINITIONS = {
  alinhamento:
    "Votos registrados (Sim, Não, Abstenção ou Obstrução) em votações nas quais a bancada escolhida orientou Sim ou Não, e quantos coincidem com a orientação. Partido é o registrado em cada voto. Mede coincidência com a orientação, não apoio ao mérito.",
  deputado:
    "Votos individuais registrados do deputado no ano, por órgão e posição, e coincidência com a orientação do Governo quando ela foi Sim ou Não. Ausência em votação não é inferida.",
  votacoes:
    "Votações por mês. 'nominais' são as que têm registros individuais de voto no arquivo oficial; votações simbólicas aparecem só em 'votacoes'.",
  fontes:
    "Arquivos oficiais de dados abertos da Câmara usados para o ano, com SHA-256 e instante da coleta.",
} as const;

export const SOURCE =
  "Arquivos anuais de dados abertos da Câmara dos Deputados (votacoes, votacoesVotos, votacoesOrientacoes, votacoesProposicoes)";

export function currentYear(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(now),
  );
}
