<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import Radar from "#lib/Radar.svelte";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  import RankRange from "#lib/RankRange.svelte";

  type Deputy = PageData["deputy"];
  type Bill = Deputy["bills"][number];
  type Vote = Deputy["recentVotes"][number];

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
  // The first status with bills opens; the others stay closed.
  const openGroup = $derived(bills?.find((g) => g.bills.length)?.key);
  // The chamber writes some committee names in capitals; the page shows them
  // in title case. Mixed-case names are left as they are.
  const LOWER_WORDS = ["de", "da", "do", "dos", "das", "e"];
  const titleCase = (name: string) =>
    name !== name.toUpperCase()
      ? name
      : name
          .toLocaleLowerCase("pt-BR")
          .split(" ")
          .map((word, i) =>
            i && LOWER_WORDS.includes(word)
              ? word
              : word.replace(
                  /(^|,)(\p{L})/gu,
                  (_, sep, c) => sep + c.toLocaleUpperCase("pt-BR"),
                ),
          )
          .join(" ");
  // A committee appears once, with each role and its start date, most recent
  // first. The chamber dates every role, so the order is known.
  const organs = $derived.by(() => {
    const byName = new Map<
      string,
      { name: string; roles: { role: string; since: string | null }[] }
    >();
    for (const o of d.organs) {
      const group = byName.get(o.name) ?? {
        name: titleCase(o.name),
        roles: [],
      };
      group.roles.push({ role: o.role, since: o.since });
      byName.set(o.name, group);
    }
    return [...byName.values()].map((g) => ({
      ...g,
      roles: g.roles.sort((a, b) =>
        (b.since ?? "").localeCompare(a.since ?? ""),
      ),
    }));
  });
  // One plain meta line per bill: situation and date, then the kind, the
  // coauthorship, the weight reasons and the points, as text.
  const billMeta = (b: Bill) =>
    [
      `${b.situation ?? "Situação não informada"}${b.statusAt ? ` · ${date(b.statusAt)}` : ""}`,
      kindLabel[b.kind],
      b.firstAuthor ? null : "coautoria",
      ...(b.quality?.reasons ?? [])
        .filter((r) => r !== "honorific")
        .map((r) => reasonLabel[r]),
    ]
      .filter(Boolean)
      .join(" · ");
</script>

{#snippet billRow(b: Bill)}
  <li class="row">
    <div class="row-main">
      <div class="bill-top">
        <a class="row-link" href={camara(b.id)} target="_blank" rel="noreferrer"
          >{b.label} ↗</a
        >
        {#if b.quality?.share}<span class="bill-pts"
            >+{points(b.quality.share)} pts</span
          >{/if}
      </div>
      <p class="row-text clamp-2">{b.ementa}</p>
      <p class="row-meta clamp-1">{billMeta(b)}</p>
      {#if b.quality?.copyOf}<p class="caveat">
          <span
            >Cópia de <a
              class="hit"
              href={camara(b.quality.copyOf.id)}
              target="_blank"
              rel="noreferrer">{b.quality.copyOf.label} ↗</a
            >, apresentado antes; o crédito fica com ele.</span
          >
        </p>{/if}
      {#if b.via}<p class="caveat">
          <span
            >Prejudicado: anexado a <a
              class="hit"
              href={camara(b.via.id)}
              target="_blank"
              rel="noreferrer">{b.via.label} ↗</a
            >{b.via.cited && b.via.cited !== b.via.label
              ? ` (citado como ${b.via.cited})`
              : ""}. Situação dele: {b.via.situation ?? "não informada"}.</span
          >
        </p>{/if}
      {#if data.explained.includes(b.id)}<a
          class="item-link"
          href={resolve(`proposta/${b.id}/`)}>Em linguagem simples →</a
        >{/if}
    </div>
  </li>
{/snippet}

{#snippet voteRow(v: Vote)}
  <li class="row tap">
    <div class="row-main">
      <p class="row-meta clamp-1">
        <span class="vote" data-tone={voteTone(v.vote)}
          ><span class="dot"></span> {v.vote || "Não informado"}</span
        >
        · {date(v.date)}{v.propositions.length
          ? ` · ${v.propositions.map((p) => p.label).join(", ")}`
          : ""}
      </p>
      <a
        class="row-title clamp-2 vote-title"
        href={v.url}
        target="_blank"
        rel="noreferrer">{v.description}</a
      >
    </div>
  </li>
{/snippet}

{#snippet organRow(o: (typeof organs)[number])}
  <li class="row">
    <div class="row-main">
      <span class="row-title org-name">{o.name}</span>
      <p class="row-meta">
        {o.roles
          .map((r) => `${r.role}${r.since ? ` desde ${date(r.since)}` : ""}`)
          .join(" · ")}
      </p>
    </div>
  </li>
{/snippet}

{#snippet calcRow(l: (typeof lines)[number])}
  <li class="row">
    <div class="row-main">
      <a class="row-link" href={camara(l.id)} target="_blank" rel="noreferrer"
        >{l.label} ↗</a
      >
      <p class="row-meta">{l.role} · {l.result}</p>
      <p class="row-text clamp-2">Peso {l.weight}. <code>{l.math}</code></p>
    </div>
    <span class="row-trail"><strong>{points(l.share)}</strong> pontos</span>
  </li>
{/snippet}

<svelte:head
  ><title>{d.name} ({d.party ?? "sem partido"}-{d.state}) — Vigia do Povo</title
  ><meta
    name="description"
    content={`Perfil de ${d.name}, deputado federal (${d.party ?? "sem partido"}-${d.state}): situação, comissões, votos registrados e atividade em ${data.year}, com dados oficiais da Câmara.`}
  /></svelte:head
>

<main id="conteudo" class="wrap page profile">
  <a class="back-link" href={resolve("deputados/")}>← Deputados</a>

  <header aria-labelledby="deputado-nome">
    <div class="who">
      {#if d.photo}<img
          class="photo"
          src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
          alt={`Foto oficial de ${d.name}`}
          title="Foto: Câmara dos Deputados"
          width="64"
          height="85"
        />{/if}
      <div>
        <h1 id="deputado-nome">{d.name}</h1>
        <p class="meta">
          {d.party ?? "Sem partido"} · {d.state ??
            "—"}{#if d.status}{" · "}<span data-tone="info"
              ><span class="dot"></span>
              {d.status === "Exercício" ? "Em exercício" : d.status}</span
            >{/if}{#if d.condition && d.condition !== "Titular"}{" · "}{d.condition}{/if}
        </p>
      </div>
    </div>
    <ul class="kpis">
      {#if bills}<li class="kpi">
          <span class="kpi-value">{number(outcomes.law ?? 0)}</span>
          <span class="kpi-label">viraram lei</span>
        </li>
        <li class="kpi">
          <span class="kpi-value">{number(outcomes.approved ?? 0)}</span>
          <span class="kpi-label">aprovados na Câmara</span>
        </li>{/if}
      <li class="kpi">
        <span class="kpi-value">{number(d.counts.plenaryVotes)}</span>
        <span class="kpi-label"
          >votos em {number(data.nominalVotings.plenary)} votações</span
        >
      </li>
    </ul>
    <a class="official" href={d.profileUrl} target="_blank" rel="noreferrer"
      >Perfil oficial na Câmara ↗</a
    >
  </header>

  <nav class="section-nav" aria-label="Seções do perfil">
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
        <h2 id="qualidade-titulo">Como está no ranking?</h2>
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
                ><span style:--value={(d.score.points / compareMax) * 100}
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
            <span>{data.quality.variants.length} pesos alternativos</span>
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
        {#if parts.length}<div class="split" aria-hidden="true">
            {#each parts as p}<span data-part={p.tone} style:--n={p.value}
              ></span>{/each}
          </div>
          <ul class="split-legend">
            {#each parts as p}<li data-part={p.tone}>
                <span class="dot"></span>{p.label}
                <strong>{points(p.value)}</strong>
              </li>{/each}
          </ul>
          <p class="hint">
            Autoria {points(d.score.authorPoints)} + relatoria {points(
              d.score.reportPoints,
            )} = <strong>{points(d.score.points)} pontos</strong>
          </p>{:else}<p class="hint">
            {lines.length
              ? "Os projetos aprovados tiveram peso zero."
              : "Nenhum projeto de autoria ou relatoria aprovado pela Câmara."}
          </p>{/if}
        {#if d.bills.length}<p class="caveat">
            {number(unscored)} de {number(d.bills.length)} projetos apresentados não
            pontuam porque não chegaram à aprovação pela Câmara.
          </p>{/if}

        {#if lines.length}<details class="disclosure">
            <summary>Como chegamos a {points(d.score.points)} pontos?</summary>
            <p class="hint">
              Cada linha: <code>peso × pontos da etapa ÷ divisão</code>,
              arredondado a centavos de ponto. O total é a soma exata dos pontos
              de cada linha.
            </p>
            <ul class="rows bare">
              {#each lines.slice(0, 5) as l}{@render calcRow(l)}{/each}
            </ul>
            {#if lines.length > 5}<details class="more">
                <summary>Ver todas ({number(lines.length)})</summary>
                <ul class="rows bare">
                  {#each lines.slice(5) as l}{@render calcRow(l)}{/each}
                </ul>
              </details>{/if}
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
        <a class="card-link" href={resolve("deputados/ranking/")}
          >Ver ranking →</a
        >
      </section>{/if}

    {#if bills}<section
        id="projetos"
        class="card"
        aria-labelledby="projetos-titulo"
      >
        <h2 id="projetos-titulo">O que já aprovou?</h2>
        {#if d.bills.length}
          <p class="hint">
            De {plural(d.bills.length, "projeto", "projetos")} apresentados desde
            {date(data.bills.since)}, como autor ou coautor.
          </p>
          <div class="split" aria-hidden="true">
            {#each bills as g}{#if g.bills.length}<span
                  data-tone={g.key}
                  style:--n={g.bills.length}
                ></span>{/if}{/each}
          </div>
          {#if kinds.some((k) => k.count)}<p class="hint">
              {kinds
                .filter((k) => k.count)
                .map((k) => `${k.label}: ${number(k.count)}`)
                .join(" · ")}
            </p>{/if}
          {#each bills as g}{#if g.bills.length}<details
                class="disclosure"
                open={g.key === openGroup}
              >
                <summary
                  ><span data-tone={g.key}
                    ><span class="dot"></span> {g.label}</span
                  ><span class="count">{number(g.bills.length)}</span></summary
                >
                <ul class="rows bare">
                  {#each g.bills.slice(0, 5) as b}{@render billRow(b)}{/each}
                </ul>
                {#if g.bills.length > 5}<details class="more">
                    <summary>Ver todos</summary>
                    <ul class="rows bare">
                      {#each g.bills.slice(5) as b}{@render billRow(b)}{/each}
                    </ul>
                  </details>{/if}
              </details>{/if}{/each}
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
              <p>
                Declarado prejudicado quando a Câmara aprovou o projeto
                principal, ao qual estava anexado. Cópia: ementa quase igual à
                de um projeto apresentado antes; o crédito fica com ele.
              </p>
              <p>Tipos contados: {data.bills.types.join(", ")}.</p>
            </div>
          </details>
        {:else}<p class="hint">
            Nenhum projeto apresentado como autor ou coautor nesta legislatura.
          </p>{/if}
      </section>{/if}

    <section id="votos" class="card" aria-labelledby="votos-titulo">
      <h2 id="votos-titulo">Como votou no Plenário?</h2>
      <p class="caveat">Aprovar um requerimento ou etapa não é aprovar lei.</p>
      {#if d.recentVotes.length}<ol class="rows bare">
          {#each d.recentVotes.slice(0, 5) as v}{@render voteRow(v)}{/each}
        </ol>
        {#if d.recentVotes.length > 5}<details class="more">
            <summary>Ver todos ({number(d.recentVotes.length)})</summary>
            <ol class="rows bare">
              {#each d.recentVotes.slice(5) as v}{@render voteRow(v)}{/each}
            </ol>
          </details>{/if}
        <details class="disclosure">
          <summary>Sobre estes votos</summary>
          <p class="prose">
            Votações nominais com registro individual. Votações simbólicas não
            identificam o voto de cada deputado. Aprovar um requerimento ou uma
            etapa não significa aprovar uma lei.
          </p>
        </details>
      {:else}<p class="hint">
          Nenhum voto nominal no Plenário registrado em {data.year}.
        </p>{/if}
    </section>

    <section id="atividade" class="card" aria-labelledby="atividade-titulo">
      <h2 id="atividade-titulo">Atividade em {data.year}</h2>
      <p class="caveat">
        Volume de registros comparado aos {data.total} deputados. Não mede qualidade.
      </p>
      <div class="activity">
        <div class="radar">
          <Radar
            {axes}
            label={`Gráfico radar da atividade de ${d.name} em ${data.year}, em percentis entre ${data.total} deputados: ${axes.map((a) => `${a.label} ${a.detail}, percentil ${a.value}`).join("; ")}.`}
          />
        </div>
        <ul
          class="rows bare"
          aria-label={`Indicadores de atividade em ${data.year}`}
        >
          {#each data.activity as a}<li class="row">
              <div class="row-main">
                <span class="row-title">{a.label}</span>
                <span class="bar" aria-hidden="true"
                  ><span style:--value={d.percentiles[a.key]}></span></span
                >
              </div>
              <span class="row-trail"
                ><strong>{number(d.counts[a.key])}</strong>percentil {d
                  .percentiles[a.key]}</span
              >
            </li>{/each}
        </ul>
      </div>
      <details class="disclosure">
        <summary>Como ler</summary>
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
      <h2 id="orgaos-titulo">Em que comissões atua?</h2>
      {#if organs.length}<p class="answer">
          Atua em <strong>{number(organs.length)}</strong>
          {organs.length === 1 ? "comissão" : "comissões"}.
        </p>
        <ul class="rows bare">
          {#each organs.slice(0, 5) as o}{@render organRow(o)}{/each}
        </ul>
        {#if organs.length > 5}<details class="more">
            <summary>Ver todas</summary>
            <ul class="rows bare">
              {#each organs.slice(5) as o}{@render organRow(o)}{/each}
            </ul>
          </details>{/if}
      {:else}<p class="hint">
          Nenhuma participação vigente nos registros oficiais da legislatura.
        </p>{/if}
    </section>

    <section id="fontes" aria-labelledby="dados-titulo">
      <h2 id="dados-titulo">Dados e fontes</h2>
      <div class="accordion">
        <details class="disclosure">
          <summary>Ficha oficial</summary>
          <dl class="facts">
            {#each facts as [term, value]}<dt>{term}</dt>
              <dd>{value}</dd>{/each}
          </dl>
        </details>
        {#if d.parties.length > 1}<details class="disclosure">
            <summary>Partidos nos votos de {data.year}</summary>
            <ul class="rows bare">
              {#each d.parties as p}<li class="row">
                  <div class="row-main">
                    <span class="row-title">{p.party}</span>
                    <p class="row-meta">
                      {p.from ? date(p.from) : "?"} a {p.until
                        ? date(p.until)
                        : "?"}
                    </p>
                  </div>
                </li>{/each}
            </ul>
          </details>{/if}
        <details class="disclosure">
          <summary>Sobre estes dados</summary>
          <div class="prose">
            <p>
              {d.photo ? "Foto: Câmara dos Deputados. " : ""}Coletados em {date(
                data.collectedAt,
              )} da API e dos arquivos de dados abertos da Câmara. Partido e estado
              são os do cadastro atual; nos votos, valem os registrados junto a cada
              voto. Não publicamos CPF, data de nascimento nem contatos.
            </p>
          </div>
          <ul class="rows bare">
            {#each data.sources as s}<li class="row">
                <div class="row-main">
                  <a class="row-link" href={s.url}>{s.url.split("/").at(-1)}</a>
                  <p class="row-meta hash">SHA-256 {s.sha256}</p>
                </div>
              </li>{/each}
            <li class="row">
              <div class="row-main">
                <a class="row-link" href={d.apiUrl}>Cadastro na API ↗</a>
              </div>
            </li>
          </ul>
          <p class="footer-links">
            <a href={resolve("transparencia/")}>Transparência dos dados</a>
            <a
              href={asset("deputados.json" as Parameters<typeof asset>[0])}
              download>Baixar todos os perfis ↗</a
            >
          </p>
        </details>
      </div>
      <AskAI href={resolve(`deputados/${d.id}.md`)} what="este deputado" />
    </section>
  </div>
</main>

<style>
  .who {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .who > div {
    min-width: 0;
  }
  .photo {
    flex: none;
    display: block;
    width: 64px;
    height: auto;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 12px;
    background: var(--surface-alt);
  }
  .meta {
    margin: 0;
    font-size: 15px;
    color: var(--muted);
  }
  .meta .dot {
    vertical-align: middle;
  }
  .kpis {
    margin-top: 16px;
  }
  .official {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 15px;
    font-weight: 700;
    color: var(--green);
  }

  /* Links whose tap area is 44px tall while the line keeps its height: the
     padding adds to the hit area, the negative margin takes it back out. */
  .row-link,
  .hit {
    padding-block: 12px;
    margin-block: -12px;
    font-weight: 700;
    color: var(--green);
  }
  .vote {
    color: var(--tone-fg);
    font-weight: 600;
  }
  .vote-title {
    font-weight: 600;
  }
  .bill-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .bill-pts {
    flex: none;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--muted);
  }
  .org-name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }

  /* Points by source: author in greens, rapporteur in blues; "via" hatched. */
  [data-part="law"],
  [data-part="lawVia"] {
    --tone-fg: var(--part-law);
  }
  [data-part="approved"],
  [data-part="approvedVia"] {
    --tone-fg: var(--part-approved);
  }
  [data-part="reportLaw"] {
    --tone-fg: var(--part-report-law);
  }
  [data-part="reportCamara"] {
    --tone-fg: var(--part-report-camara);
  }
  /* The "via" stripes use the surface between stripes, so they show in both
     colour schemes; the legend swatch carries the same stripes. */
  .split > [data-part$="Via"],
  .split-legend [data-part$="Via"] > .dot {
    background: repeating-linear-gradient(
      135deg,
      var(--tone-fg) 0 3px,
      var(--surface) 3px 6px
    );
  }

  .sub {
    margin-top: 16px;
    font-size: 16px;
  }
  .split {
    margin-top: 10px;
  }
  .compare {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
    color: var(--muted);
  }
  .compare li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 10px;
    align-items: baseline;
  }
  .compare strong {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .compare .me {
    font-weight: 700;
    color: var(--ink);
  }
  .compare .bar {
    grid-column: 1 / -1;
    height: 14px;
    border-radius: 6px;
  }
  .compare .bar > span {
    background: var(--median-bar);
  }
  .compare .me .bar > span {
    background: var(--green);
  }
  .range-box {
    display: grid;
    gap: 6px;
    margin-block: 14px 10px;
    padding: 12px;
    border-radius: 12px;
    background: var(--bg);
  }
  .range-text {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    font-size: 14px;
  }
  .range-text strong {
    white-space: nowrap;
  }
  .activity {
    display: grid;
    gap: 8px;
  }
  /* The radar repeats the list on phones; from 900px it sits beside it. */
  .radar {
    display: none;
  }
  .activity .bar {
    margin-top: 4px;
  }
  #fontes :global(.ask-ai) {
    margin-top: 12px;
  }

  @media (min-width: 900px) {
    .activity {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 16px;
    }
    .radar {
      display: block;
    }
  }
</style>
