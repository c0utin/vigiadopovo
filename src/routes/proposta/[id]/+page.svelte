<script lang="ts">
  import { resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import type { Proposition } from "#lib/portal.ts";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  let { data }: { data: PageData } = $props();
  let p = $derived(data.proposal);
  const votes = $derived(
    p.votes.toSorted((a, b) => b.date.localeCompare(a.date)),
  );
  // Long ementas show their start; the full text opens in the details.
  const short = $derived(
    p.ementa.length > 300
      ? `${p.ementa.slice(0, p.ementa.lastIndexOf(" ", 260))}…`
      : null,
  );
</script>

{#snippet ementaText()}
  <div class="ementa-text">
    {#if short}
      <p class="ementa-short">{short}</p>
      <details class="more">
        <summary>Ler o texto inteiro</summary>
        <p>{p.ementa}</p>
      </details>
    {:else}
      <p>{p.ementa}</p>
    {/if}
  </div>
{/snippet}

{#snippet voteRow(vote: Proposition["votes"][number])}
  <li class="row tap">
    <div class="row-main">
      <p class="row-meta">
        {date(vote.date)} · {vote.organ} · registro oficial ↗
      </p>
      <a
        class="row-title clamp-2"
        href={vote.url}
        target="_blank"
        rel="noreferrer">{vote.description}</a
      >
    </div>
  </li>
{/snippet}

<svelte:head
  ><title>{p.summary?.title ?? p.label} — Vigia do Povo</title><meta
    name="description"
    content={p.summary?.text ?? p.ementa}
  /></svelte:head
>
<main id="conteudo" class="wrap page proposal">
  <a class="back-link" href={`${resolve("/")}#propostas`}>← Propostas</a>

  <header class="proposal-head">
    <p class="eyebrow">
      {p.summary ? `${p.summary.topic} · ${p.label}` : p.type}
    </p>
    <h1>{p.summary?.title ?? p.label}</h1>
    {#if p.summary}
      <p class="lead">{p.summary.text}</p>
      <p class="caveat">Resumo por IA, sem revisão humana</p>
    {:else}
      {@render ementaText()}
      <p class="caveat">
        Texto oficial da Câmara. Sem resumo por IA nesta coleta.
      </p>
    {/if}
    <p class="status">
      <span data-tone="info"
        ><span class="dot"></span>
        {p.status?.descricaoSituacao ?? "Não informada pela Câmara"}</span
      >
    </p>
    <ul class="kpis">
      <li class="kpi">
        <span class="kpi-value date">{date(p.presentedAt)}</span>
        <span class="kpi-label">Apresentada</span>
      </li>
      <li class="kpi">
        <span class="kpi-value date"
          >{p.status?.dataHora ? date(p.status.dataHora) : "Sem data"}</span
        >
        <span class="kpi-label">Andamento</span>
      </li>
      <li class="kpi">
        <span class="kpi-value">{votes.length}</span>
        <span class="kpi-label">Votações</span>
      </li>
    </ul>
    <div class="links">
      <a class="button primary" href={p.url} target="_blank" rel="noreferrer"
        >Ver na Câmara ↗</a
      >
      {#if p.documentUrl}<a
          class="card-link"
          href={p.documentUrl}
          target="_blank"
          rel="noreferrer">Texto completo ↗</a
        >{/if}
    </div>
  </header>

  {#if p.summary}
    <section class="card" aria-labelledby="ementa-titulo">
      <h2 id="ementa-titulo">Texto oficial (ementa)</h2>
      {@render ementaText()}
    </section>
  {/if}

  {#if votes.length}
    <section class="card" aria-labelledby="votacoes-titulo">
      <h2 id="votacoes-titulo">Votações</h2>
      <p class="caveat">Votação aprovada não significa que virou lei.</p>
      <ol class="rows bare">
        {#each votes.slice(0, 5) as vote}{@render voteRow(vote)}{/each}
      </ol>
      {#if votes.length > 5}
        <details class="more">
          <summary>Ver as outras votações</summary>
          <ol class="rows bare">
            {#each votes.slice(5) as vote}{@render voteRow(vote)}{/each}
          </ol>
        </details>
      {/if}
      {#if data.ballotCount}<a
          class="card-link"
          href={`${resolve("dados/")}?proposicao=${p.id}`}
          >Ver como cada deputado votou ({data.ballotCount}) →</a
        >{/if}
    </section>
  {:else}
    <section class="no-votes" aria-labelledby="votacoes-titulo">
      <h2 id="votacoes-titulo">Votações</h2>
      <p class="hint">
        Nenhuma votação registrada nesta coleta. Isso não prevê se haverá
        votação.
      </p>
    </section>
  {/if}

  <div class="accordion">
    {#if p.summary}
      <details class="disclosure">
        <summary>Sobre este resumo</summary>
        <p class="prose">
          Explica só a ementa, não o texto completo, e não é aconselhamento
          jurídico.
        </p>
      </details>
    {/if}
    <details class="disclosure">
      <summary>Autoria</summary>
      <p class="prose">
        {p.authors.map((a) => a.name).join("; ") || "Não informada"}
      </p>
    </details>
    <details class="disclosure">
      <summary>Etapa do último andamento</summary>
      <p class="prose">
        {p.status?.descricaoTramitacao ?? "Não informada"}{p.status?.siglaOrgao
          ? ` · ${p.status.siglaOrgao}`
          : ""}
      </p>
    </details>
    {#if p.status?.despacho}<details class="disclosure">
        <summary>Despacho oficial</summary>
        <p class="prose">{p.status.despacho}</p>
      </details>{/if}
    <details class="disclosure">
      <summary
        >Temas oficiais da Câmara <span class="count"
          >{p.labels?.length ?? 0}</span
        ></summary
      >
      {#if p.labels?.length}<ul class="prose">
          {#each p.labels as label}<li>
              <a href={label.sourceUrl}>{label.name}</a>
            </li>{/each}
        </ul>{:else}<p class="prose">
          Sem classificação temática oficial nesta coleta.
        </p>{/if}
    </details>
    <details class="disclosure">
      <summary>Sobre estes dados</summary>
      <p class="prose">A lista de votações inclui requerimentos e etapas.</p>
      <dl class="facts">
        <dt>Coletados em</dt>
        <dd>
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(data.collectedAt))} (Brasília)
        </dd>
        {#if p.summary}<dt>Resumo gerado em</dt>
          <dd>{date(p.summary.generatedAt)} · {p.summary.method}</dd>{/if}
        <dt>Versão da ementa (SHA-256)</dt>
        <dd class="hash">{p.sourceHash}</dd>
      </dl>
      <p class="footer-links">
        <a href={p.apiUrl} target="_blank" rel="noreferrer"
          >Dados na API da Câmara ↗</a
        >
        <a href={resolve("sobre/")}>Como os resumos são feitos</a>
        <a href={resolve("transparencia/")}>Transparência dos dados</a>
      </p>
    </details>
  </div>

  <AskAI href={resolve(`proposta/${p.id}.md`)} what="esta proposta" />
</main>

<style>
  .proposal {
    display: grid;
    gap: 12px;
  }
  .proposal-head {
    display: grid;
    gap: 10px;
  }
  .proposal-head h1 {
    margin: 0;
  }
  .proposal-head .lead {
    margin: 0;
    font-size: 16px;
  }
  .ementa-text {
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-2);
  }
  .ementa-text p,
  .ementa-text details {
    margin: 0;
    font-size: inherit;
    line-height: inherit;
  }
  .ementa-text:has(details[open]) .ementa-short {
    display: none;
  }
  .card .ementa-text {
    font-size: 15px;
  }
  .status {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--green);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }
  .links .button {
    flex: none;
  }
  .row-title {
    font-weight: 600;
  }
  .no-votes h2 {
    margin-bottom: 4px;
    font-size: 17px;
  }
  .card > .caveat {
    margin-bottom: 8px;
  }
</style>
