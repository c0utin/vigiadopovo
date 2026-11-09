<script lang="ts">
  import { resolve } from "$app/paths";
  import AskAI from "#lib/AskAI.svelte";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import feed from "./feed.js?raw";

  type Proposal = PageData["periods"][number]["propositions"][number];

  // Longer groups show their first proposals; the rest sit behind "Ver todos".
  const SHOWN = 10;

  let { data: portal }: { data: PageData } = $props();
  const topics = $derived([
    ...new Set(
      portal.periods
        .flatMap((period) => period.propositions.map((p) => p.topic))
        .filter((t): t is string => !!t),
    ),
  ]);
</script>

<svelte:head
  ><title>Vigia do Povo — Política sem complicação</title><meta
    name="description"
    content="Entenda propostas e votações da Câmara dos Deputados em linguagem simples. Resumos com inteligência artificial, fontes oficiais e transparência em cada etapa."
  /></svelte:head
>

{#snippet proposal(p: Proposal)}
  <li class="row tap" data-search={p.search} data-topic={p.topic ?? ""}>
    <div class="row-main">
      <a
        class="row-title clamp-2"
        class:official={p.topic === null}
        href={resolve(`proposta/${p.id}/`)}>{p.title}</a
      >
      <p class="row-meta clamp-1">
        {[p.label, p.stage, p.topic ?? (p.stage ? null : "ementa oficial")]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
    <span class="row-trail">{date(p.date).slice(0, 5)}</span>
    <span class="chev" aria-hidden="true"></span>
  </li>
{/snippet}

<main id="conteudo" class="page wrap">
  <h1 class="home-title">O que a Câmara decide</h1>

  <form class="deputy" method="get" action={resolve("deputados/")}>
    <label for="inicio-uf">Quem é o meu deputado?</label>
    <select id="inicio-uf" name="uf" class="select" required>
      <option value="">Estado</option>
      {#each portal.states as uf}<option>{uf}</option>{/each}
    </select>
    <button type="submit" class="button primary">Ver</button>
  </form>

  <div class="filter-bar" data-filters hidden>
    <label class="search-field"
      ><span aria-hidden="true">⌕</span><span class="sr-only"
        >Buscar propostas</span
      ><input
        id="busca"
        type="search"
        autocomplete="off"
        placeholder="Assunto, número ou autor"
      /></label
    >
    <div class="chips" role="group" aria-label="Filtrar por tema">
      <button type="button" data-topic-filter="" aria-pressed="true"
        >Todos</button
      >{#each topics as t}<button
          type="button"
          data-topic-filter={t}
          aria-pressed="false">{t}</button
        >{/each}
    </div>
  </div>
  <p class="caveat">Resumos por IA, sem revisão humana. Proposta não é lei.</p>
  <p class="sr-only" data-count aria-live="polite">
    {portal.total} propostas
  </p>

  <div id="propostas">
    {#each portal.periods as period}
      <section class="period" data-period>
        <h2 class="period-title">
          {period.title}
          <span class="period-count" data-period-count
            >{period.propositions.length}</span
          >
        </h2>
        <ul class="rows">
          {#each period.propositions.slice(0, SHOWN) as p (p.id)}
            {@render proposal(p)}
          {/each}
        </ul>
        {#if period.propositions.length > SHOWN}
          <details class="more">
            <summary>Ver todos ({period.propositions.length})</summary>
            <ul class="rows">
              {#each period.propositions.slice(SHOWN) as p (p.id)}
                {@render proposal(p)}
              {/each}
            </ul>
          </details>
        {/if}
      </section>
    {/each}
  </div>
  <div class="empty-state" data-empty hidden>
    <h3>Nenhuma proposta encontrada.</h3>
    <p>Tente outra palavra ou outro tema.</p>
    <button type="button" class="button secondary" data-clear
      >Limpar busca e tema</button
    >
  </div>

  <p class="snapshot">
    Atualizado em {date(portal.collectedAt)} · amostra da Câmara
  </p>

  <div class="accordion">
    <details class="disclosure">
      <summary>Como funciona</summary>
      <div class="prose">
        <ol>
          <li>
            <strong>Fonte oficial.</strong> API de Dados Abertos da Câmara, com autoria,
            datas e links.
          </li>
          <li>
            <strong>Linguagem simples.</strong> A IA explica só a ementa. Não inventa
            impactos nem indica voto.
          </li>
          <li>
            <strong>Você confere.</strong> Cada proposta leva ao texto oficial e à
            ficha na Câmara.
          </li>
        </ol>
      </div>
      <a class="card-link" href={resolve("sobre/")}
        >Fontes, método e limites →</a
      >
    </details>
    <details class="disclosure">
      <summary>Usar com IA</summary>
      <AskAI
        href={resolve("llms.txt")}
        what="todas as propostas, votações e deputados"
        copy
      />
    </details>
  </div>
</main>
{@html `<script>${feed}<\/script>`}

<style>
  .home-title {
    margin: 4px 0 12px;
  }
  /* Official ementa, not an AI title: lighter and ink-2 so the two differ. */
  .official {
    font-weight: 500;
    color: var(--ink-2);
  }
  .deputy {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .deputy label {
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--green);
  }
  .deputy .select {
    flex: 1 1 0;
    width: auto;
    padding-inline: 10px 26px;
  }
  .deputy .button {
    flex: none;
    min-width: 56px;
    padding-inline: 10px;
  }
  .caveat {
    margin-block: 10px 16px;
    font-size: 12px;
  }
  .period-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 20px 0 8px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--green-2);
  }
  .period-count {
    min-width: 26px;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--lime);
    color: var(--on-lime);
    font-size: 13px;
    text-align: center;
    letter-spacing: 0;
  }
  .snapshot {
    margin-top: 16px;
  }
  .accordion {
    margin-top: 16px;
  }
</style>
