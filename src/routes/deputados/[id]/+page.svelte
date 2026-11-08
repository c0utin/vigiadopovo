<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import Radar from "#lib/Radar.svelte";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  import RankRange from "#lib/RankRange.svelte";

  let { data }: { data: PageData } = $props();
  const d = $derived(data.deputy);
  const number = (value: number) => value.toLocaleString("pt-BR");
  const axes = $derived(
    data.activity.map((a) => ({
      label: a.short,
      value: d.percentiles[a.key],
      detail: number(d.counts[a.key]),
    })),
  );
  const facts = $derived(
    [
      ["Situação", d.status],
      ["Condição eleitoral", d.condition],
      ["Desde", d.statusSince ? date(d.statusSince) : null],
      ["Nome civil", d.civilName],
      ["Naturalidade", d.birthplace],
      ["Escolaridade", d.schooling],
    ].filter((fact): fact is [string, string] => Boolean(fact[1])),
  );
  // A deputados.json collected before bills existed has neither field: the
  // profile then renders without the section instead of failing.
  const bills = $derived(
    data.bills && d.bills
      ? data.bills.outcomes.map((o) => ({
          ...o,
          bills: d.bills.filter((b) => b.outcome === o.key),
        }))
      : null,
  );
  // Labelled kinds only; a dataset collected before kinds existed has none.
  const kinds = $derived(
    (data.bills?.kinds ?? [])
      .filter((k) => k.key !== "other")
      .map((k) => ({
        ...k,
        count: d.bills?.filter((b) => b.kind === k.key).length ?? 0,
      })),
  );
  const kindLabel = $derived(
    Object.fromEntries(kinds.map((k) => [k.key, k.label])),
  );
  const reasonLabel = $derived(
    Object.fromEntries(
      (data.quality?.reasons ?? []).map((r) => [r.key, r.label]),
    ),
  );
  const points = (value: number) =>
    value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const stageLabel = $derived(
    Object.fromEntries(
      (data.quality?.stages ?? []).map((s) => [s.key, s.label]),
    ),
  );
  const outcomeLabel = $derived(
    Object.fromEntries(
      (data.bills?.outcomes ?? []).map((o) => [o.key, o.label]),
    ),
  );
  // The weight with its reason, as in the published rules.
  const weightText = (
    type: string,
    weight: number,
    reasons: readonly string[],
    copyOf: { label: string } | null,
  ) => {
    const q = data.quality!;
    if (reasons.includes("copy"))
      return `0 (cópia de ${copyOf?.label ?? "projeto anterior"})`;
    if (reasons.includes("returned")) return "0 (devolvida)";
    const low = reasons.find(
      (r) => r === "honorific" || r === "authorizing" || r === "concession",
    );
    if (low) return `${points(weight)} (${reasonLabel[low].toLowerCase()})`;
    if (reasons.includes("local"))
      return `${points(q.weights.reach[type] ?? 0)} × ${points(q.weights.local)} = ${points(weight)} (${type}, alcance local)`;
    return `${points(weight)} (${type})`;
  };
  // Every line that adds points, and copies, so that a zero is explained
  // too. The total is the exact sum of the last column. Datasets from rules
  // version 1 carry no factors: they show the summary without the table.
  const lines = $derived(
    data.quality && d.score && data.quality.version >= 2
      ? [
          ...d.bills.flatMap((b) => {
            const c = b.quality?.calc;
            if (!c) return [];
            const type = b.label.split(" ")[0];
            return [
              {
                id: b.id,
                label: b.label,
                role: b.firstAuthor ? "Autor" : "Coautor",
                result: b.via
                  ? `${outcomeLabel[b.outcome]}: ${b.via.label}`
                  : stageLabel[b.quality.stage],
                weight: weightText(
                  type,
                  c.weight,
                  b.quality.reasons,
                  b.quality.copyOf,
                ),
                math: `${points(c.weight)} × ${points(c.base)}${c.pool > 1 ? ` ÷ ${c.pool} anexados` : ""}${c.proponents > 1 ? ` ÷ ${c.proponents} proponentes` : ""}`,
                share: b.quality.share,
              },
            ];
          }),
          ...d.score.reports.map((r) => ({
            id: r.id,
            label: r.label,
            role: "Relator",
            result: stageLabel[r.stage],
            weight: `${points(r.weight)} (${r.label.split(" ")[0]})`,
            math: `${points(r.weight)} × ${points(r.base)}${r.rapporteurs > 1 ? ` ÷ ${r.rapporteurs} relatores` : ""}`,
            share: r.share,
          })),
        ].sort((a, b) => b.share - a.share || a.id - b.id)
      : [],
  );
  const outcomes = $derived(
    Object.fromEntries(
      (data.bills?.outcomes ?? []).map((o) => [
        o.key,
        d.bills?.filter((b) => b.outcome === o.key).length ?? 0,
      ]),
    ) as Record<string, number>,
  );
  // Short chip labels for the reasons that lower or zero a bill's weight.
  const voteTone = (vote: string) =>
    vote === "Sim" ? "yes" : vote === "Não" ? "no" : "neutral";
  const camara = (id: number) =>
    `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`;
  const plural = (n: number, one: string, many: string) =>
    `${number(n)} ${n === 1 ? one : many}`;
  const cents = (value: number) => Math.round(value * 100) / 100;
  const sum = (values: number[]) => cents(values.reduce((t, v) => t + v, 0));
  // Where the points come from: the shares grouped by role and result. They
  // add up to the published total, which is itself the sum of every share.
  const parts = $derived.by(() => {
    const own = (d.bills ?? []).filter((b) => b.quality.share > 0);
    const shares = (list: typeof own) => sum(list.map((b) => b.quality.share));
    const reports = d.score?.reports ?? [];
    return [
      {
        tone: "law",
        label: "Autoria · virou lei",
        value: shares(own.filter((b) => !b.via && b.quality.stage === "law")),
      },
      {
        tone: "lawVia",
        label: "Autoria · virou lei por outro projeto",
        value: shares(own.filter((b) => b.via && b.outcome === "lawVia")),
      },
      {
        tone: "approved",
        label: "Autoria · aprovado na Câmara",
        value: shares(own.filter((b) => !b.via && b.quality.stage !== "law")),
      },
      {
        tone: "approvedVia",
        label: "Autoria · aprovado por outro projeto",
        value: shares(own.filter((b) => b.via && b.outcome !== "lawVia")),
      },
      {
        tone: "reportLaw",
        label: "Relatoria · virou lei",
        value: sum(
          reports.filter((r) => r.stage === "law").map((r) => r.share),
        ),
      },
      {
        tone: "reportCamara",
        label: "Relatoria · aprovado na Câmara",
        value: sum(
          reports.filter((r) => r.stage !== "law").map((r) => r.share),
        ),
      },
    ].filter((p) => p.value > 0);
  });
  // The deputy next to the chamber's median, on the same scale.
  const median = $derived(data.medianPoints);
  const compareMax = $derived(Math.max(d.score?.points ?? 0, median ?? 0) || 1);
  const comparison = $derived(
    !d.score || median === null
      ? ""
      : d.score.points > median
        ? "Acima da mediana da Câmara"
        : d.score.points < median
          ? "Abaixo da mediana da Câmara"
          : "Igual à mediana da Câmara",
  );
  // By stage, not by calculation line: a copy approved by the Câmara has
  // no line either, and older datasets have no lines at all.
  const unscored = $derived(
    d.bills?.filter(
      (b) =>
        b.quality &&
        b.quality.stage !== "law" &&
        b.quality.stage !== "camara" &&
        b.outcome !== "lawVia" &&
        b.outcome !== "approvedVia",
    ).length ?? 0,
  );
</script>

<svelte:head
  ><title>{d.name} ({d.party ?? "sem partido"}-{d.state}) — Vigia do Povo</title
  ><meta
    name="description"
    content={`Perfil de ${d.name}, deputado federal (${d.party ?? "sem partido"}-${d.state}): situação, comissões, votos registrados e atividade em ${data.year}, com dados oficiais da Câmara.`}
  /></svelte:head
>

<main id="conteudo" class="wrap page profile">
  <a class="back-link" href={resolve("deputados/")}>← Deputados</a>

  <header class="card report-head" aria-labelledby="deputado-nome">
    <div class="who">
      {#if d.photo}<img
          src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
          alt={`Foto oficial de ${d.name}`}
          title="Foto: Câmara dos Deputados"
          width="177"
          height="236"
        />{/if}
      <div>
        <p class="eyebrow">Boletim · Deputado federal · {data.year}</p>
        <h1 id="deputado-nome">{d.name}</h1>
        <p class="party">
          <strong>{d.party ?? "Sem partido"}</strong>-{d.state ?? "—"}
        </p>
        <p class="chips-row">
          {#if d.status}<span class="chip" data-tone="info">{d.status}</span
            >{/if}{#if d.condition}<span class="chip plain outline"
              >{d.condition}</span
            >{/if}
        </p>
      </div>
    </div>
    <ul class="stats" aria-label="Resumo do boletim">
      {#if d.score}<li>
          <a class="stat" href="#qualidade"
            ><span class="stat-value">{points(d.score.points)}</span><span
              class="stat-label">Pontos de qualidade</span
            ><span class="stat-hint">{d.score.rank}º de {data.total}</span></a
          >
        </li>{/if}
      {#if bills}<li>
          <a class="stat" href="#projetos"
            ><span class="stat-value">{number(outcomes.law ?? 0)}</span><span
              class="stat-label">Viraram lei</span
            ><span class="stat-hint"
              >{outcomes.lawVia
                ? `+${number(outcomes.lawVia)} por outro projeto`
                : `de ${number(d.bills.length)} projetos`}</span
            ></a
          >
        </li>
        <li>
          <a class="stat" href="#projetos"
            ><span class="stat-value">{number(outcomes.approved ?? 0)}</span
            ><span class="stat-label">Aprovados na Câmara</span><span
              class="stat-hint"
              >{outcomes.approvedVia
                ? `+${number(outcomes.approvedVia)} por outro projeto`
                : "ainda não são lei"}</span
            ></a
          >
        </li>{/if}
      <li>
        <a class="stat" href="#votos"
          ><span class="stat-value">{number(d.counts.plenaryVotes)}</span><span
            class="stat-label">Votos no Plenário</span
          ><span class="stat-hint"
            >em {number(data.nominalVotings.plenary)} votações nominais</span
          ></a
        >
      </li>
    </ul>
    <a
      class="button secondary official"
      href={d.profileUrl}
      target="_blank"
      rel="noreferrer">Perfil oficial na Câmara ↗</a
    >
  </header>

  <nav class="section-nav" aria-label="Seções do boletim">
    <ol>
      {#if data.quality && d.score}<li><a href="#qualidade">Pontos</a></li>{/if}
      {#if bills}<li><a href="#projetos">Projetos</a></li>{/if}
      <li><a href="#votos">Votos</a></li>
      <li><a href="#atividade">Atividade</a></li>
      <li><a href="#orgaos">Comissões</a></li>
      <li><a href="#fontes">Dados e fontes</a></li>
    </ol>
  </nav>

  <div class="page-sections">
    {#if data.quality && d.score}<section
        id="qualidade"
        class="card"
        aria-labelledby="qualidade-titulo"
      >
        <div class="card-head">
          <h2 id="qualidade-titulo">Como está no ranking?</h2>
          <a class="chip plain" href={resolve("deputados/ranking/")}
            >Ver ranking →</a
          >
        </div>
        <p class="answer">
          <strong>{d.score.rank}º de {data.total}</strong>{d.score.points === 0
            ? " · Nenhum ponto até agora"
            : comparison
              ? ` · ${comparison}`
              : ""}
        </p>
        <p class="hint">
          Só conta resultado: projeto aprovado pela Câmara ou que virou lei.
        </p>
        {#if median !== null}<ul
            class="compare"
            aria-label="Pontos comparados à mediana da Câmara"
          >
            <li class="me">
              <span>{d.name}</span><strong>{points(d.score.points)} pts</strong
              ><span class="bar" aria-hidden="true"
                ><span
                  class:zero={!d.score.points}
                  style:--value={(d.score.points / compareMax) * 100}
                ></span></span
              >
            </li>
            <li>
              <span>Mediana dos {data.total} deputados</span><strong
                >{points(median)} pts</strong
              ><span class="bar" aria-hidden="true"
                ><span style:--value={(median / compareMax) * 100}></span></span
              >
            </li>
          </ul>{/if}
        <div class="range-box">
          <p class="range-text">
            <span>Com {data.quality.variants.length} pesos alternativos</span>
            <strong
              >{d.score.rankRange[0] !== d.score.rankRange[1]
                ? `entre ${d.score.rankRange[0]}º e ${d.score.rankRange[1]}º`
                : `sempre ${d.score.rank}º`}</strong
            >
          </p>
          <RankRange
            rank={d.score.rank}
            range={d.score.rankRange}
            total={data.total}
          />
        </div>

        <h3 class="sub">De onde vêm os pontos?</h3>
        {#if parts.length}<div class="stack" aria-hidden="true">
            {#each parts as p}<span data-part={p.tone} style:flex-grow={p.value}
              ></span>{/each}
          </div>
          <ul class="legend">
            {#each parts as p}<li>
                <span class="swatch" data-part={p.tone}></span><span
                  >{p.label}</span
                ><strong>{points(p.value)}</strong>
              </li>{/each}
          </ul>
          <p class="sum">
            Autoria {points(d.score.authorPoints)} + relatoria {points(
              d.score.reportPoints,
            )} = <strong>{points(d.score.points)} pontos</strong>
          </p>{:else}<p class="hint">
            {lines.length
              ? "Os projetos aprovados tiveram peso zero."
              : "Nenhum projeto de autoria ou relatoria aprovado pela Câmara."}
          </p>{/if}
        {#if d.bills.length}<p class="hint">
            {number(unscored)} de {number(d.bills.length)} projetos apresentados não
            pontuam porque não chegaram à aprovação pela Câmara.
          </p>{/if}

        {#if lines.length}<details class="disclosure calc-box">
            <summary
              >Como chegamos a {points(d.score.points)} pontos?
              <span class="count"
                >{lines.length} {lines.length === 1 ? "linha" : "linhas"}</span
              ></summary
            >
            <p class="hint">
              Cada linha: <code>peso × pontos da etapa ÷ divisão</code>,
              arredondado a centavos de ponto. O total é a soma exata da coluna
              Pontos.
            </p>
            <table class="data-table calc">
              <caption class="sr-only"
                >Projetos que somam pontos de qualidade</caption
              >
              <thead>
                <tr>
                  <th scope="col">Projeto</th>
                  <th scope="col">Papel</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Peso</th>
                  <th scope="col">Cálculo</th>
                  <th scope="col" class="num">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {#each lines as l}<tr>
                    <th scope="row"
                      ><a href={camara(l.id)} target="_blank" rel="noreferrer"
                        >{l.label} ↗</a
                      ></th
                    >
                    <td data-label="Papel">{l.role}</td>
                    <td data-label="Resultado">{l.result}</td>
                    <td data-label="Peso">{l.weight}</td>
                    <td data-label="Cálculo"><code>{l.math}</code></td>
                    <td class="num share">{points(l.share)}</td>
                  </tr>{/each}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="5">Total</th>
                  <td class="num share"
                    ><strong>{points(d.score.points)}</strong></td
                  >
                </tr>
              </tfoot>
            </table>
          </details>{/if}
        <details class="disclosure">
          <summary>O que conta e o que não conta</summary>
          <div class="prose">
            <p>
              Só pontua projeto aprovado pela Câmara (autor {data.quality.points
                .camara}, relator {data.quality.reportPoints.camara}) ou
              transformado em lei (autor {data.quality.points.law}, relator {data
                .quality.reportPoints.law}). Apresentar, ter relator ou parecer
              vale 0.
            </p>
            <p>
              O peso depende do alcance da norma e cai para honoríficos,
              autorizativos, alcance local, cópias e devolvidas.
              <a href={`${resolve("deputados/ranking/")}#metodo`}
                >Regras e fundamentos legais</a
              >.
            </p>
          </div>
        </details>
      </section>{/if}

    {#if data.bills && bills}<section
        id="projetos"
        class="card"
        aria-labelledby="projetos-titulo"
      >
        <h2 id="projetos-titulo">O que já aprovou?</h2>
        {#if d.bills.length && !outcomes.law && !outcomes.approved}<p
            class="answer"
          >
            Nenhum projeto virou lei nem foi aprovado na Câmara.
          </p>{:else if d.bills.length}<p class="answer">
            <strong
              >{plural(outcomes.law ?? 0, "virou lei", "viraram lei")}</strong
            >
            e
            <strong
              >{plural(
                outcomes.approved ?? 0,
                "foi aprovado",
                "foram aprovados",
              )} na Câmara</strong
            >.
          </p>{/if}
        <p class="hint">
          De {plural(d.bills.length, "projeto", "projetos")} ({data.bills.types.join(
            ", ",
          )}) apresentados desde {date(data.bills.since)}, como autor ou
          coautor.
        </p>
        {#if d.bills.length}<ul class="outcomes">
            {#each bills as g}<li data-tone={g.key}>
                <svelte:element
                  this={g.bills.length ? "a" : "span"}
                  href={g.bills.length ? `#projetos-${g.key}` : undefined}
                  ><strong>{number(g.bills.length)}</strong><span
                    >{g.label}</span
                  ></svelte:element
                >
              </li>{/each}
          </ul>
          {#if kinds.some((k) => k.count)}<p class="chips-row kinds">
              {#each kinds.filter((k) => k.count) as k}<span
                  class="chip plain outline"
                  >{k.label}: {number(k.count)} de {number(
                    d.bills.length,
                  )}</span
                >{/each}
            </p>{/if}
          <details class="disclosure">
            <summary>O que significa cada situação</summary>
            <div class="prose">
              <p>
                A situação é a última registrada pela Câmara. Um projeto
                tramitando em conjunto segue o destino do projeto ao qual foi
                anexado.
              </p>
              <ul>
                {#each data.bills.outcomes as o}<li>
                    <strong>{o.label}:</strong>
                    {o.description}
                  </li>{/each}
                {#each kinds as k}<li>
                    <strong>{k.label}:</strong>
                    {k.description} Classificação por regras fixas sobre a ementa.
                  </li>{/each}
              </ul>
            </div>
          </details>
          {#each bills as g}{#if g.bills.length}<details
                id={`projetos-${g.key}`}
                class="disclosure bill-group"
                open={g.bills.length <= 10}
              >
                <summary
                  ><span class="chip" data-tone={g.key}>{g.label}</span><span
                    class="count">{number(g.bills.length)}</span
                  ></summary
                >
                <p class="hint">{g.description}</p>
                <ol class="item-list">
                  {#each g.bills as b}<li class="item">
                      <p class="item-top">
                        <span class="item-id">{b.label}</span>
                        {#if b.quality?.share}<span class="chip plain points"
                            >+{points(b.quality.share)} pts</span
                          >{/if}
                      </p>
                      {#if kindLabel[b.kind] || (b.quality?.reasons ?? []).some((r) => r !== "honorific") || !b.firstAuthor}<p
                          class="chips-row"
                        >
                          {#if !b.firstAuthor}<span class="chip plain outline"
                              >Coautoria</span
                            >{/if}{#if kindLabel[b.kind]}<span
                              class="chip plain outline"
                              >{kindLabel[b.kind]}</span
                            >{/if}{#each b.quality?.reasons ?? [] as r}{#if r !== "honorific"}<span
                                class="chip"
                                data-tone={r === "copy" || r === "returned"
                                  ? "warn"
                                  : "neutral"}>{reasonLabel[r]}</span
                              >{/if}{/each}
                        </p>{/if}
                      <p class="item-text">{b.ementa}</p>
                      {#if b.quality?.copyOf}<p class="item-meta">
                          Ementa quase igual à do <a
                            href={camara(b.quality.copyOf.id)}
                            target="_blank"
                            rel="noreferrer">{b.quality.copyOf.label} ↗</a
                          >, apresentado antes; o crédito fica com ele.
                        </p>{/if}
                      {#if b.via}<p class="item-meta">
                          Declarado prejudicado quando a Câmara aprovou o
                          projeto principal, <a
                            href={camara(b.via.id)}
                            target="_blank"
                            rel="noreferrer">{b.via.label} ↗</a
                          >{b.via.cited && b.via.cited !== b.via.label
                            ? ` (citado como ${b.via.cited})`
                            : ""}, ao qual estava anexado. Situação dele: {b.via
                            .situation ?? "não informada"}.
                        </p>{/if}
                      <p class="item-foot">
                        <span
                          >{b.situation ?? "Situação não informada"}{b.statusAt
                            ? ` · ${date(b.statusAt)}`
                            : ""}<br />Apresentado em {date(
                            b.presentedAt,
                          )}</span
                        ><a
                          class="item-link"
                          href={camara(b.id)}
                          target="_blank"
                          rel="noreferrer">Tramitação ↗</a
                        >
                      </p>
                    </li>{/each}
                </ol>
              </details>{/if}{/each}{:else}<p class="hint">
            Nenhum projeto apresentado como autor ou coautor nesta legislatura.
          </p>{/if}
      </section>{/if}

    <section id="votos" class="card" aria-labelledby="votos-titulo">
      <div class="card-head">
        <h2 id="votos-titulo">Como votou no Plenário?</h2>
        <p class="hint">Aprovar um requerimento ou etapa não é aprovar lei.</p>
      </div>
      {#if d.recentVotes.length}<ol class="item-list">
          {#each d.recentVotes as v}<li class="item">
              <p class="item-top">
                <span class="chip vote" data-tone={voteTone(v.vote)}
                  >{v.vote || "Tipo de voto não informado"}</span
                ><span class="item-id"
                  >{date(v.date)}{#if v.propositions.length}
                    · {v.propositions.map((p) => p.label).join(", ")}{/if}</span
                >
              </p>
              <p class="item-text">{v.description}</p>
              <a class="item-link" href={v.url} target="_blank" rel="noreferrer"
                >Registro oficial ↗</a
              >
            </li>{/each}
        </ol>
        <details class="disclosure">
          <summary>Sobre estes votos</summary>
          <p class="prose">
            Votações nominais com registro individual. Votações simbólicas não
            identificam o voto de cada deputado. Aprovar um requerimento ou uma
            etapa não significa aprovar uma lei.
          </p>
        </details>{:else}<p class="hint">
          Nenhum voto nominal no Plenário registrado em {data.year}.
        </p>{/if}
    </section>

    <section id="atividade" class="card" aria-labelledby="atividade-titulo">
      <div class="card-head">
        <h2 id="atividade-titulo">Atividade em {data.year}</h2>
        <p class="hint">
          Volume de registros comparado aos {data.total} deputados. Não mede qualidade.
        </p>
      </div>
      <div class="activity">
        <Radar
          {axes}
          label={`Gráfico radar da atividade de ${d.name} em ${data.year}, em percentis entre ${data.total} deputados: ${axes.map((a) => `${a.label} ${a.detail}, percentil ${a.value}`).join("; ")}.`}
        />
        <table class="data-table activity-table">
          <caption class="sr-only"
            >Indicadores de atividade em {data.year}</caption
          >
          <thead
            ><tr
              ><th scope="col">Indicador</th><th scope="col" class="num"
                >Total</th
              ><th scope="col" class="num">Percentil</th></tr
            ></thead
          >
          <tbody>
            {#each data.activity as a}<tr>
                <th scope="row"
                  >{a.label}<span class="bar" aria-hidden="true"
                    ><span style:--value={d.percentiles[a.key]}></span></span
                  ></th
                >
                <td class="num total">{number(d.counts[a.key])}</td>
                <td class="num">{d.percentiles[a.key]}</td>
              </tr>{/each}
          </tbody>
        </table>
      </div>
      <details class="disclosure">
        <summary>Como ler o gráfico</summary>
        <div class="prose">
          <p>
            Cada eixo mostra a posição entre os {data.total} deputados em exercício:
            quanto mais longe do centro, maior o volume registrado em relação aos
            demais. A linha tracejada é a mediana. O gráfico mede quantidade de registros
            oficiais, não qualidade, mérito ou posição política. Quem assumiu durante
            o ano teve menos tempo para acumular registros.
          </p>
          <ul>
            {#each data.activity as a}<li>
                <strong>{a.label}:</strong>
                {a.description}
              </li>{/each}
          </ul>
          <p>
            Em {data.year}, houve {number(data.nominalVotings.plenary)} votações nominais
            no Plenário e {number(data.nominalVotings.committee)} em outros órgãos
            com registro individual.
          </p>
        </div>
      </details>
    </section>

    <section id="orgaos" class="card" aria-labelledby="orgaos-titulo">
      <div class="card-head">
        <h2 id="orgaos-titulo">Em que comissões atua?</h2>
        <span class="big-count">{d.organs.length}</span>
      </div>
      {#if d.organs.length}<ul class="organs">
          {#each d.organs as o}<li>
              <strong>{o.name}</strong>
              <span
                ><span class="chip plain outline">{o.role}</span>{o.since
                  ? ` desde ${date(o.since)}`
                  : ""}</span
              >
            </li>{/each}
        </ul>{:else}<p class="hint">
          Nenhuma participação vigente nos registros oficiais da legislatura.
        </p>{/if}
    </section>

    <section id="fontes" class="card" aria-labelledby="dados-titulo">
      <h2 id="dados-titulo">Dados oficiais</h2>
      <dl class="facts">
        {#each facts as [term, value]}<dt>{term}</dt>
          <dd>{value}</dd>{/each}
      </dl>
      {#if d.parties.length > 1}<h3 class="sub">
          Partidos nos votos de {data.year}
        </h3>
        <ol class="parties">
          {#each d.parties as p}<li>
              <strong>{p.party}</strong>
              {p.from ? date(p.from) : "?"} a {p.until ? date(p.until) : "?"}
            </li>{/each}
        </ol>{/if}
      {#if d.photo}<p class="hint">Foto: Câmara dos Deputados</p>{/if}
      <details class="disclosure">
        <summary>Sobre estes dados</summary>
        <p class="prose">
          Coletados em {date(data.collectedAt)} da API e dos arquivos de dados abertos
          da Câmara. Partido e estado são os do cadastro atual; nos votos, valem os
          registrados junto a cada voto. Não publicamos CPF, data de nascimento nem
          contatos.
        </p>
        <ul class="sources">
          {#each data.sources as s}<li>
              <a href={s.url}>{s.url.split("/").at(-1)}</a>
              <span class="hash">SHA-256 {s.sha256}</span>
            </li>{/each}
          <li><a href={d.apiUrl}>Cadastro na API ↗</a></li>
        </ul>
        <p class="footer-links">
          <a href={resolve("transparencia/")}>Transparência dos dados</a>
          <a
            href={asset("deputados.json" as Parameters<typeof asset>[0])}
            download>Baixar todos os perfis ↗</a
          >
        </p>
      </details>
      <AskAI href={resolve(`deputados/${d.id}.md`)} what="este deputado" />
    </section>
  </div>
</main>

<style>
  .report-head {
    display: grid;
    gap: 14px;
  }
  .who {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
  }
  img {
    display: block;
    width: 84px;
    height: auto;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 14px;
    background: #e5e8d9;
  }
  .eyebrow {
    margin-bottom: 4px;
    font-size: 11px;
  }
  h1 {
    font-size: clamp(24px, 6.6vw, 40px);
    margin-bottom: 2px;
  }
  .party {
    margin: 0 0 8px;
    font-size: 17px;
  }
  .stat {
    height: 100%;
  }
  .official {
    min-height: 44px;
  }
  .card-head .chip {
    min-height: 32px;
    text-decoration: none;
  }
  .big-count {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .compare {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .compare li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 10px;
    align-items: baseline;
    font-size: 14px;
    color: var(--muted);
  }
  .compare strong {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .compare .me {
    color: var(--ink);
    font-weight: 700;
  }
  .compare .me strong {
    font-size: 22px;
  }
  .compare .bar {
    grid-column: 1 / -1;
    height: 14px;
    border-radius: 6px;
  }
  .compare .bar > span {
    background: #7d8c7a;
  }
  .compare .me .bar > span {
    background: var(--green);
  }
  .compare .zero {
    min-width: 0;
  }
  .stack {
    display: flex;
    gap: 2px;
    height: 28px;
    border-radius: 8px;
    overflow: hidden;
  }
  .stack span {
    flex: 0 1 0;
    min-width: 3px;
  }
  /* Author in greens, rapporteur in blues; "via" credit is hatched. */
  [data-part="law"] {
    background: #1b5523;
  }
  [data-part="lawVia"] {
    background: repeating-linear-gradient(
      135deg,
      #1b5523 0 3px,
      #a9c9b2 3px 6px
    );
  }
  [data-part="approved"] {
    background: #5f8a1c;
  }
  [data-part="approvedVia"] {
    background: repeating-linear-gradient(
      135deg,
      #5f8a1c 0 3px,
      #cfe0a5 3px 6px
    );
  }
  [data-part="reportLaw"] {
    background: #1e4a73;
  }
  [data-part="reportCamara"] {
    background: #6b93c4;
  }
  .legend {
    display: grid;
    gap: 2px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
  }
  .legend strong {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 4px;
  }
  .sum {
    margin: 6px 0 10px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 14px;
  }
  .range-box {
    display: grid;
    gap: 6px;
    margin-block: 14px 10px;
    padding: 12px;
    border-radius: 12px;
    background: var(--bg);
  }
  .range-text strong {
    white-space: nowrap;
  }
  .range-text {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    font-size: 14px;
  }
  .calc-box .hint {
    margin-bottom: 8px;
  }
  .calc code {
    white-space: nowrap;
  }
  .calc tfoot th,
  .calc tfoot td {
    border-top: 2px solid var(--green);
    border-bottom: 0;
    font-size: 16px;
  }
  .calc tbody th {
    font-weight: 700;
    white-space: nowrap;
  }
  /* Narrow screens: each table row becomes a small card. */
  @media (max-width: 719px) {
    .calc thead {
      display: none;
    }
    .calc tbody tr {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--line);
    }
    .calc tbody th,
    .calc tbody td {
      padding: 0;
      border: 0;
    }
    .calc tbody th {
      flex: 1 1 calc(100% - 96px);
    }
    .calc tbody th a {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
    }
    .calc tbody td.share {
      font-size: 18px;
      font-weight: 800;
    }
    .calc tbody td[data-label] {
      order: 1;
      font-size: 13px;
      white-space: normal;
    }
    .calc tbody td[data-label]::before {
      content: attr(data-label) " ";
      color: var(--muted);
    }
    .calc tfoot tr {
      display: flex;
      justify-content: space-between;
    }
    .calc tfoot th,
    .calc tfoot td {
      padding: 12px 0;
    }
  }
  .outcomes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
  }
  .outcomes > li > * {
    display: grid;
    align-content: start;
    gap: 2px;
    height: 100%;
    min-height: 64px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--tone-bg);
    color: var(--tone-fg);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
    text-decoration: none;
  }
  .outcomes > li > span {
    opacity: 0.75;
  }
  .outcomes strong {
    font-size: 28px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .kinds {
    margin-bottom: 4px;
  }
  .bill-group > summary .chip {
    font-size: 14px;
  }
  .bill-group .item-list {
    margin-top: 8px;
  }
  .bill-group .item {
    background: var(--bg);
    border-color: transparent;
  }
  .item-meta a {
    font-weight: 700;
  }
  .points {
    background: var(--green);
    color: var(--lime);
  }
  .vote {
    font-size: 14px;
  }
  .activity {
    display: grid;
    gap: 8px;
    align-items: center;
  }
  .activity-table tbody th {
    display: grid;
    gap: 6px;
    font-weight: 700;
  }
  .activity-table .total {
    font-size: 18px;
    font-weight: 800;
  }
  .organs {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .organs li {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bg);
  }
  .organs li > span {
    font-size: 13px;
    color: var(--muted);
  }
  .organs .chip {
    margin-right: 6px;
    font-size: 12px;
  }
  .sub {
    margin-top: 16px;
    font-size: 16px;
  }
  .parties {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }
  #fontes .hint {
    margin-top: 10px;
  }
  .sources {
    display: grid;
    gap: 6px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }
  .sources li {
    display: grid;
  }
  .sources a {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    font-weight: 600;
  }
  #fontes :global(.ask-ai) {
    margin-top: 12px;
  }
  @media (min-width: 600px) {
    img {
      width: 120px;
    }
    .outcomes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .organs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .report-head {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
      align-items: center;
      gap: 20px 32px;
    }
    .official {
      grid-column: 1;
      justify-self: start;
    }
    .report-head .stats {
      grid-column: 2;
      grid-row: 1 / span 2;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .page-sections {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    .page-sections > section {
      margin-top: 0;
    }
    #qualidade,
    #projetos {
      grid-column: 1 / -1;
    }
    .activity {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
