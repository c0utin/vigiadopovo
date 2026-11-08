<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import Radar from "#lib/Radar.svelte";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";

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
      // Situation and electoral condition already read in the header.
      ["No cargo desde", d.statusSince ? date(d.statusSince) : null],
      ["Nome civil", d.civilName],
      ["Naturalidade", d.birthplace],
      ["Escolaridade", d.schooling],
    ].filter((fact): fact is [string, string] => Boolean(fact[1])),
  );
  // A deputados.json collected before bills existed has neither field: the
  // profile then renders without the section instead of failing.
  const outcomes = $derived(
    data.bills && d.bills
      ? data.bills.outcomes.map((o) => ({
          ...o,
          all: d.bills.filter((b) => b.outcome === o.key).length,
        }))
      : null,
  );
  const mainBills = $derived(d.bills?.filter((b) => b.firstAuthor).length ?? 0);
  const laws = $derived(
    d.bills?.filter((b) => b.outcome === "law").length ?? 0,
  );
  const outcomeLabel = $derived(
    Object.fromEntries((outcomes ?? []).map((o) => [o.key, o.label])),
  );
  // "fevereiro de 2023": the legislature start reads better as a month.
  const month = (day: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`));
  // Most readers do not know the acronyms.
  const billType: Record<string, string> = {
    PL: "Projeto de lei",
    PLP: "Projeto de lei complementar",
    PEC: "Proposta de emenda à Constituição",
    PDL: "Projeto de decreto legislativo",
  };
  // Without JavaScript the list shows this many bills of the chosen filter
  // until "Mostrar todos" is ticked (see the CSS below).
  const FIRST = 10;
  // The official list repeats an organ once per role: one line per organ.
  const organs = $derived(
    [...Map.groupBy(d.organs, (o) => o.name.toLocaleLowerCase("pt-BR"))].map(
      ([, roles]) => ({ name: roles[0].name, roles }),
    ),
  );
  const ORGANS_FIRST = 6;
  // "Deputado federal titular, em exercício".
  const role = $derived(
    [
      ["Deputado federal", d.condition?.toLocaleLowerCase("pt-BR")]
        .filter(Boolean)
        .join(" "),
      d.status === "Exercício"
        ? "em exercício"
        : d.status?.toLocaleLowerCase("pt-BR"),
    ]
      .filter(Boolean)
      .join(", "),
  );
  const voteKind = (vote: string) =>
    vote === "Sim" ? "yes" : vote === "Não" ? "no" : "other";
</script>

<svelte:head
  ><title>{d.name} ({d.party ?? "sem partido"}-{d.state}) — Vigia do Povo</title
  ><meta
    name="description"
    content={`Perfil de ${d.name}, deputado federal (${d.party ?? "sem partido"}-${d.state}): projetos de lei, situação, comissões, votos registrados e atividade em ${data.year}, com dados oficiais da Câmara.`}
  /></svelte:head
>

<main id="conteudo" class="wrap detail-page">
  <a class="back-link" href={resolve("deputados/")}>← Deputados</a>
  <header class="profile-head">
    {#if d.photo}<img
        src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
        alt={`Foto oficial de ${d.name}`}
        width="177"
        height="236"
      />{/if}
    <div>
      <h1>{d.name}</h1>
      <p class="party">
        <strong>{d.party ?? "Sem partido"}</strong>
        <span aria-hidden="true">·</span>
        {d.state ?? "—"}
      </p>
      <p class="role">{role}</p>
      <a class="official" href={d.profileUrl} target="_blank" rel="noreferrer"
        >Perfil oficial na Câmara ↗</a
      >
    </div>
  </header>

  <div class="profile-body">
    <div class="profile-main">
      <!-- First after the header: what a deputy proposed, and what came of
      it, is the question most visitors bring. -->
      {#if data.bills && outcomes}<section
          class="bills"
          aria-labelledby="projetos-titulo"
        >
          <h2 id="projetos-titulo">Projetos de lei</h2>
          {#if d.bills.length}<div class="tally">
              <p>
                <strong>{number(d.bills.length)}</strong>
                <span
                  >{d.bills.length === 1 ? "apresentado" : "apresentados"} desde
                  {month(data.bills.since)}</span
                >
              </p>
              <p class="law">
                <strong>{number(laws)}</strong>
                <span>{laws === 1 ? "virou lei" : "viraram lei"}</span>
              </p>
            </div>
            <svg
              class="spread"
              viewBox={`0 0 ${d.bills.length} 1`}
              preserveAspectRatio="none"
              role="img"
              aria-label={outcomes
                .map((o) => `${o.label}: ${number(o.all)}`)
                .join("; ")}
            >
              {#each outcomes as o, i}<rect
                  class={o.key}
                  x={outcomes.slice(0, i).reduce((sum, p) => sum + p.all, 0)}
                  width={o.all}
                  height="1"
                />{/each}
            </svg>
            <p class="authorship">
              {number(mainBills)} como autor principal, o primeiro a assinar, e
              {number(d.bills.length - mainBills)} em coautoria.
            </p>
            <fieldset>
              <legend class="sr-only">Filtrar projetos</legend>
              <div class="chips">
                <label class:long={d.bills.length > FIRST}
                  ><input
                    type="radio"
                    name="projetos"
                    value="bill"
                    checked
                  />Todos <span>{number(d.bills.length)}</span></label
                >
                {#each outcomes as o}<label class:long={o.all > FIRST}
                    ><input
                      type="radio"
                      name="projetos"
                      value={o.key}
                      disabled={!o.all}
                    /><i class="dot {o.key}"></i>{o.label}
                    <span>{number(o.all)}</span></label
                  >{/each}
                <label class:long={mainBills > FIRST}
                  ><input
                    type="radio"
                    name="projetos"
                    value="main"
                    disabled={!mainBills}
                  />Só autoria principal <span>{number(mainBills)}</span></label
                >
              </div>
            </fieldset>
            <ol class="bill-list">
              {#each d.bills as b}<li
                  class="bill {b.outcome}"
                  class:main={b.firstAuthor}
                >
                  <p class="status">
                    <i class="dot"></i>{outcomeLabel[b.outcome]}
                  </p>
                  <h3>
                    {b.label}<span
                      >{` · ${billType[b.label.split(" ")[0]] ?? ""}`}</span
                    >
                  </h3>
                  <p class="ementa">{b.ementa}</p>
                  <p class="bill-meta">
                    {b.firstAuthor ? "Autoria principal" : "Coautoria"} · apresentado
                    em {date(b.presentedAt)}<br />
                    Situação: {b.situation ?? "não informada"}{b.statusAt &&
                    b.statusAt !== b.presentedAt
                      ? `, desde ${date(b.statusAt)}`
                      : ""}
                  </p>
                  <p class="bill-links">
                    {#if data.explained.includes(b.id)}<a
                        href={resolve(`proposta/${b.id}/`)}
                        >Em linguagem simples →</a
                      >{/if}
                    <a
                      href={`https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${b.id}`}
                      target="_blank"
                      rel="noreferrer">Tramitação na Câmara ↗</a
                    >
                  </p>
                </li>{/each}
            </ol>
            <label class="show-all button secondary"
              ><input type="checkbox" /><span class="more">Mostrar todos</span
              ><span class="less">Mostrar só os {FIRST} mais recentes</span
              ></label
            >
            <details class="help">
              <summary>Como ler esta lista</summary>
              <p>
                {data.bills.types
                  .map((t) => `${billType[t] ?? t} (${t})`)
                  .join(", ")}, do mais recente ao mais antigo. Autoria
                principal é ser o primeiro a assinar; coautoria é assinar junto.
                A situação é a última registrada pela Câmara.
              </p>
              <dl>
                {#each outcomes as o}<dt>
                    <i class="dot {o.key}"></i>{o.label}
                  </dt>
                  <dd>{o.description}</dd>{/each}
              </dl>
              <p>
                Um projeto “tramitando em conjunto” foi anexado a outro e segue
                o destino dele.
              </p>
            </details>
          {:else}<p class="muted">
              Nenhum projeto apresentado como autor ou coautor nesta
              legislatura.
            </p>{/if}
        </section>{/if}

      <section aria-labelledby="atividade-titulo">
        <h2 id="atividade-titulo">Atividade em {data.year}</h2>
        <p class="lede">
          Posição entre os {data.total} deputados em exercício pelo volume de registros
          oficiais. Não mede qualidade, mérito nem posição política.
        </p>
        <div class="activity">
          <Radar
            {axes}
            label={`Gráfico radar da atividade de ${d.name} em ${data.year}, em percentis entre ${data.total} deputados: ${axes.map((a) => `${a.label} ${a.detail}, percentil ${a.value}`).join("; ")}.`}
          />
          <table>
            <caption class="sr-only"
              >Indicadores de atividade em {data.year}</caption
            >
            <thead
              ><tr
                ><th scope="col">Indicador</th><th scope="col">Total</th><th
                  scope="col">Percentil</th
                ></tr
              ></thead
            >
            <tbody>
              {#each data.activity as a}<tr>
                  <th scope="row">{a.label}</th>
                  <td>{number(d.counts[a.key])}</td>
                  <td>{d.percentiles[a.key]}</td>
                </tr>{/each}
            </tbody>
          </table>
        </div>
        <details class="help">
          <summary>O que cada indicador conta</summary>
          <dl>
            {#each data.activity as a}<dt>{a.label}</dt>
              <dd>{a.description}</dd>{/each}
          </dl>
          <p>
            No gráfico, quanto mais longe do centro, maior o volume em relação
            aos demais; a linha tracejada é a mediana. Quem assumiu durante o
            ano teve menos tempo para acumular registros. Em {data.year}, houve
            {number(data.nominalVotings.plenary)} votações nominais no Plenário e
            {number(data.nominalVotings.committee)} em outros órgãos com registro
            individual.
          </p>
        </details>
      </section>

      <section aria-labelledby="orgaos-titulo">
        <h2 id="orgaos-titulo">Comissões e órgãos</h2>
        {#if organs.length}<p class="lede">
            Participa hoje de {organs.length}
            {organs.length === 1 ? "órgão" : "órgãos"}.
          </p>
          {#snippet organ(o: (typeof organs)[number])}<li>
              <strong>{o.name}</strong>
              <span
                >{o.roles
                  .map(
                    (r) =>
                      `${r.role}${r.since ? ` desde ${date(r.since)}` : ""}`,
                  )
                  .join(" · ")}</span
              >
            </li>{/snippet}
          <ul class="organs">
            {#each organs.slice(0, ORGANS_FIRST) as o}{@render organ(o)}{/each}
          </ul>
          {#if organs.length > ORGANS_FIRST}<details class="more-organs">
              <summary
                >Ver mais {organs.length - ORGANS_FIRST}
                {organs.length - ORGANS_FIRST === 1
                  ? "órgão"
                  : "órgãos"}</summary
              >
              <ul class="organs">
                {#each organs.slice(ORGANS_FIRST) as o}{@render organ(o)}{/each}
              </ul>
            </details>{/if}
        {:else}<p class="muted">
            Nenhuma participação vigente nos registros oficiais da legislatura.
          </p>{/if}
      </section>

      <section aria-labelledby="votos-titulo">
        <h2 id="votos-titulo">Últimos votos no Plenário</h2>
        {#if d.recentVotes.length}<p class="lede">
            Só votações nominais, em que cada voto é registrado. Aprovar um
            requerimento ou uma etapa não significa aprovar uma lei.
          </p>
          <ol class="votes">
            {#each d.recentVotes as v}<li>
                <p class="vote-top">
                  <span class="vote {voteKind(v.vote)}"
                    >{v.vote || "Voto não informado"}</span
                  >
                  <span
                    >{[
                      date(v.date),
                      ...v.propositions.map((p) => p.label),
                    ].join(" · ")}</span
                  >
                </p>
                <p>{v.description}</p>
                <a href={v.url} target="_blank" rel="noreferrer"
                  >Registro oficial ↗</a
                >
              </li>{/each}
          </ol>{:else}<p class="muted">
            Nenhum voto nominal no Plenário registrado em {data.year}.
          </p>{/if}
      </section>
    </div>

    <aside class="facts" aria-labelledby="dados-titulo">
      <h2 id="dados-titulo">Dados oficiais</h2>
      <dl>
        {#each facts as [term, value]}<dt>{term}</dt>
          <dd>{value}</dd>{/each}
      </dl>
      {#if d.parties.length > 1}<h3>Partidos nos votos de {data.year}</h3>
        <ol class="parties">
          {#each d.parties as p}<li>
              <strong>{p.party}</strong>
              {p.from ? date(p.from) : "?"} a {p.until ? date(p.until) : "?"}
            </li>{/each}
        </ol>{/if}
      <AskAI href={resolve(`deputados/${d.id}.md`)} what="este deputado" />
    </aside>
  </div>

  <details class="about">
    <summary>Sobre estes dados</summary>
    <p>
      Coletados em {date(data.collectedAt)} da API e dos arquivos de dados abertos
      da Câmara. Foto oficial: Câmara dos Deputados. Partido e estado são os do cadastro
      atual; nos votos, valem os registrados junto a cada voto. Não publicamos CPF,
      data de nascimento nem contatos.
    </p>
    <ul class="sources">
      {#each data.sources as s}<li>
          <a href={s.url}>{s.url.split("/").at(-1)}</a>
          <span class="hash">SHA-256 {s.sha256}</span>
        </li>{/each}
      <li><a href={d.apiUrl}>Cadastro na API ↗</a></li>
    </ul>
    <p>
      <a href={resolve("transparencia/")}>Transparência dos dados</a> ·
      <a href={asset("deputados.json" as Parameters<typeof asset>[0])} download
        >Baixar todos os perfis ↗</a
      >
    </p>
  </details>
</main>

<style>
  /* Rhythm: 4 / 8 / 12 / 16 / 24 / 40 / 56. Hairlines group; boxes are rare. */
  .profile-head {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    padding-bottom: 24px;
  }
  .profile-head img {
    display: block;
    width: 88px;
    height: auto;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 8px;
    background: #e5e8d9;
  }
  h1 {
    font-size: 30px;
    letter-spacing: -0.8px;
    line-height: 1.08;
    margin: 0 0 8px;
    text-wrap: balance;
  }
  .party {
    margin: 0 0 2px;
    font-size: 16px;
  }
  .party span {
    color: var(--muted);
  }
  .role {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
  .official {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 14px;
    font-weight: 600;
  }
  h2 {
    font-size: 26px;
    margin: 0 0 8px;
  }
  section {
    padding-block: 32px 8px;
    border-top: 1px solid var(--line);
  }
  .lede {
    margin: 0 0 16px;
    max-width: 62ch;
    font-size: 15px;
    line-height: 1.55;
    color: var(--muted);
  }

  /* The bold move: the bill tally reads before anything else. */
  .tally {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 24px;
    max-width: 520px;
    margin: 16px 0;
  }
  .tally p {
    display: grid;
    align-content: start;
    margin: 0;
  }
  .tally strong {
    font:
      400 52px/1 Georgia,
      "Times New Roman",
      serif;
    letter-spacing: -2px;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .tally .law strong {
    color: #2f7d3a;
  }
  .tally span {
    margin-top: 8px;
    font-size: 14px;
    line-height: 1.4;
    color: var(--muted);
  }
  .spread {
    display: block;
    width: 100%;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
  }
  .spread rect {
    fill: var(--tone);
  }
  .authorship {
    margin: 12px 0 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  /* Filters: one radio group, no JavaScript. */
  .bills fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .bills .chips label {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid #c9d2c1;
    border-radius: 20px;
    background: #fff;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
  }
  .chips label span {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .chips label:has(:checked) {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
    font-weight: 600;
  }
  .chips label:has(:checked) span {
    color: #d8ed95;
  }
  .chips label:has(:disabled) {
    display: none;
  }
  .chips label:has(:focus-visible) {
    outline: 2px solid #507b29;
    outline-offset: 2px;
  }
  .chips input,
  .show-all input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .dot {
    flex: none;
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tone);
  }
  .chips label:has(:checked) .dot {
    box-shadow: 0 0 0 2px #fff;
  }

  .bill-list,
  .organs,
  .votes,
  .parties,
  .sources {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bill-list {
    margin-top: 8px;
  }
  .bill {
    padding: 20px 0 8px;
    border-bottom: 1px solid var(--line);
  }
  .bill p {
    margin: 0;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .bill h3 {
    margin: 6px 0 4px;
    font-size: 17px;
    font-variant-numeric: tabular-nums;
  }
  .bill h3 span {
    font-weight: 400;
    color: var(--muted);
  }
  .ementa {
    max-width: 68ch;
    font-size: 16px;
    line-height: 1.5;
  }
  .bill .bill-meta {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }
  .bill-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 24px;
  }
  .bill-links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 14px;
    font-weight: 600;
  }
  /* The chosen chip's value is the class its bills carry. */
  .bills:has([value="main"]:checked) .bill:not(.main),
  .bills:has([value="law"]:checked) .bill:not(.law),
  .bills:has([value="approved"]:checked) .bill:not(.approved),
  .bills:has([value="rejected"]:checked) .bill:not(.rejected),
  .bills:has([value="active"]:checked) .bill:not(.active),
  .bills:has([value="closed"]:checked) .bill:not(.closed),
  /* Only the first 10 (FIRST) of them until "Mostrar todos" is ticked. */
  .bills:not(:has(.show-all :checked)):has([value="bill"]:checked)
    .bill:nth-child(n + 11 of .bill),
  .bills:not(:has(.show-all :checked)):has([value="main"]:checked)
    .bill:nth-child(n + 11 of .main),
  .bills:not(:has(.show-all :checked)):has([value="law"]:checked)
    .bill:nth-child(n + 11 of .law),
  .bills:not(:has(.show-all :checked)):has([value="approved"]:checked)
    .bill:nth-child(n + 11 of .approved),
  .bills:not(:has(.show-all :checked)):has([value="rejected"]:checked)
    .bill:nth-child(n + 11 of .rejected),
  .bills:not(:has(.show-all :checked)):has([value="active"]:checked)
    .bill:nth-child(n + 11 of .active),
  .bills:not(:has(.show-all :checked)):has([value="closed"]:checked)
    .bill:nth-child(n + 11 of .closed) {
    display: none;
  }
  .show-all {
    position: relative;
    display: none;
    width: 100%;
    margin-top: 16px;
    cursor: pointer;
  }
  .bills:has(.long :checked) .show-all {
    display: flex;
  }
  .show-all:has(:checked) .more,
  .show-all:not(:has(:checked)) .less {
    display: none;
  }
  .show-all:has(:focus-visible) {
    outline: 2px solid #507b29;
    outline-offset: 2px;
  }

  .help {
    margin-top: 8px;
    color: var(--muted);
  }
  .help summary {
    font-weight: 600;
    color: var(--green);
  }
  .help dl {
    display: grid;
    gap: 2px;
    margin: 12px 0 0;
  }
  .help dt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--green);
  }
  .help dd {
    margin: 0 0 10px;
  }

  table {
    width: 100%;
    max-width: 520px;
    border-collapse: collapse;
    margin-block: 16px 4px;
    font-size: 15px;
  }
  th,
  td {
    text-align: left;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  thead th + th,
  td {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 22%;
  }
  tbody th {
    font-weight: 400;
  }

  .organs li {
    display: grid;
    gap: 2px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .organs strong {
    font-size: 15px;
    line-height: 1.4;
  }
  .organs span {
    font-size: 13px;
    color: var(--muted);
  }
  .organs:first-of-type {
    border-top: 1px solid var(--line);
  }
  .more-organs {
    padding-block: 4px 0;
  }
  .more-organs summary {
    font-size: 14px;
    font-weight: 600;
  }

  .votes {
    border-top: 1px solid var(--line);
  }
  .votes li {
    padding: 16px 0 4px;
    border-bottom: 1px solid var(--line);
  }
  .votes p {
    margin: 0 0 6px;
    font-size: 15px;
    line-height: 1.55;
  }
  .votes .vote-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 12px;
    font-size: 13px;
    color: var(--muted);
  }
  .vote {
    font-size: 15px;
    font-weight: 700;
    color: var(--green);
  }
  .vote::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 2px;
    background: #a3aaa0;
    vertical-align: 1px;
  }
  .vote.yes::before {
    background: #2f7d3a;
  }
  .vote.no::before {
    background: #b8432f;
  }
  .votes li:last-child {
    border-bottom: 0;
  }
  .votes a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 14px;
  }

  .facts {
    margin-top: 32px;
    padding: 24px 0 0;
    border-top: 1px solid var(--line);
  }
  .facts h2 {
    font-size: 22px;
    margin-bottom: 16px;
  }
  .facts dl {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 10px 12px;
    margin: 0;
  }
  .facts dt {
    font-size: 13px;
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }
  .facts h3 {
    font-size: 15px;
    margin: 20px 0 8px;
  }
  .parties li {
    font-size: 14px;
    padding-block: 4px;
  }
  .about {
    margin-top: 40px;
    border-top: 1px solid var(--line);
  }
  .sources li {
    display: grid;
    padding-block: 6px;
  }
  .sources a {
    min-height: 32px;
  }
  .sources .hash {
    font-size: 11px;
  }

  .law {
    --tone: #2f7d3a;
  }
  .approved {
    --tone: #9cc95a;
  }
  .rejected {
    --tone: #b8432f;
  }
  .active {
    --tone: #d9b54a;
  }
  .closed {
    --tone: #a3aaa0;
  }

  @media (min-width: 600px) {
    .profile-head {
      grid-template-columns: 128px minmax(0, 1fr);
      gap: 24px;
    }
    .profile-head img {
      width: 128px;
      border-radius: 10px;
    }
    h1 {
      font-size: 44px;
      letter-spacing: -1.4px;
    }
    .tally strong {
      font-size: 72px;
    }
  }
  @media (min-width: 900px) {
    .activity {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 40px;
      align-items: center;
    }
    .show-all {
      width: auto;
      padding-inline: 32px;
    }
    .bills:has(.long :checked) .show-all {
      display: inline-flex;
    }
    .profile-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 64px;
      align-items: start;
    }
    .facts {
      position: sticky;
      top: 24px;
      margin-top: 0;
      padding-top: 32px;
    }
  }
</style>
