<script lang="ts">
  import { resolve } from "$app/paths";
  import AskAI from "#lib/AskAI.svelte";
  import type { PageData } from "./$types";
  import Congress from "#lib/Congress.svelte";
  import { date } from "#lib/format.ts";
  import feed from "./feed.js?raw";

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

<main id="conteudo" class="page">
  <section class="home-hero wrap" aria-labelledby="inicio-titulo">
    <div>
      <p class="eyebrow">O povo é o patrão</p>
      <h1 id="inicio-titulo">
        Veja o que a Câmara decide. <em>Sem complicação.</em>
      </h1>
      <p class="hint">
        Propostas em palavras simples, com link para a fonte oficial.
      </p>
    </div>
    <div class="hero-art" aria-hidden="true">
      <Congress />
    </div>
  </section>

  <ul class="wrap shortcuts" aria-label="Comece por uma pergunta">
    {#if portal.states.length}<li class="mine">
        <svg
          class="shortcut-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><path
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0"
          /></svg
        ><strong>Quem é o meu deputado?</strong><span
          >Escolha seu estado e veja o boletim.</span
        >
        <form method="get" action={resolve("deputados/")}>
          <label class="sr-only" for="inicio-uf">Seu estado</label><select
            id="inicio-uf"
            name="uf"
            required
            ><option value="">Seu estado</option
            >{#each portal.states as uf}<option>{uf}</option>{/each}</select
          ><button type="submit" class="button primary">Ver</button>
        </form>
      </li>
      <li>
        <a href={resolve("deputados/ranking/")}
          ><svg
            class="shortcut-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            ><path d="M3 20h18M5 20v-6h4v6m1 0V9h4v11m1 0v-8h4v8" /></svg
          ><strong>Quem mais aprova leis?</strong><span
            >Ranking por resultado, não por quantidade.</span
          ></a
        >
      </li>{/if}
    <li>
      <a href="#propostas"
        ><svg
          class="shortcut-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><path d="M7 3h7l4 4v14H6V3h1m7 0v5h4M9 12h6M9 16h6" /></svg
        ><strong>O que a Câmara está decidindo?</strong><span
          >{portal.total} propostas em palavras simples.</span
        ></a
      >
    </li>
  </ul>

  <section id="propostas" class="wrap feed" aria-labelledby="propostas-titulo">
    <div class="section-heading">
      <h2 id="propostas-titulo">Propostas</h2>
      <p class="snapshot">
        Atualizado em {date(portal.collectedAt)} · amostra da Câmara
      </p>
    </div>
    <div class="feed-filters" data-filters hidden>
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
    <p class="results-info">
      <strong data-count aria-live="polite">{portal.total} propostas</strong>
      <span class="chip plain" data-tone="warn"
        >Resumos por IA, sem revisão humana. Proposta não é lei.</span
      >
    </p>
    {#each portal.periods as period, index}
      <section class="period" data-period aria-labelledby="periodo-{index}">
        <h3 id="periodo-{index}">
          {period.title}
          <span class="period-count" data-period-count
            >{period.propositions.length}</span
          >
        </h3>
        <ul class="item-list proposal-grid" role="list">
          {#each period.propositions as p}
            <li
              class="item tap"
              data-search={p.search}
              data-topic={p.topic ?? ""}
            >
              <p class="item-top">
                <span class="chip plain">{p.topic ?? "Ementa oficial"}</span
                ><span class="item-id">{p.label}</span>
              </p>
              <h4 class="item-title">
                <a href={resolve(`proposta/${p.id}/`)}>{p.title}</a>
              </h4>
              <p class="item-text clamp">{p.text}</p>
              <p class="item-foot">
                <span class="chip outline"
                  >{p.stage ?? "Situação não informada"}</span
                ><span>{p.latest.kind} em {date(p.latest.date)}</span>
              </p>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    <div class="empty-state" data-empty hidden>
      <h3>Nenhuma proposta encontrada.</h3>
      <p>Tente outra palavra ou outro tema.</p>
      <button type="button" class="button secondary" data-clear
        >Limpar busca e tema</button
      >
    </div>
  </section>

  <section class="wrap method" aria-labelledby="metodo-titulo">
    <div class="card">
      <h2 id="metodo-titulo">Como funciona</h2>
      <ol class="steps">
        <li>
          <strong>Fonte oficial</strong>
          <span
            >API de Dados Abertos da Câmara, com autoria, datas e links.</span
          >
        </li>
        <li>
          <strong>Linguagem simples</strong>
          <span
            >A IA explica só a ementa. Não inventa impactos nem indica voto.</span
          >
        </li>
        <li>
          <strong>Você confere</strong>
          <span>Cada proposta leva ao texto oficial e à ficha na Câmara.</span>
        </li>
      </ol>
      <a class="card-link" href={resolve("sobre/")}
        >Fontes, método e limites →</a
      >
    </div>
    <AskAI
      href={resolve("llms.txt")}
      what="todas as propostas, votações e deputados"
      copy
    />
  </section>
</main>
{@html `<script>${feed}<\/script>`}

<style>
  .home-hero {
    display: grid;
    align-items: center;
    padding-block: 12px 16px;
  }
  .home-hero .hint {
    font-size: 16px;
  }
  .hero-art {
    display: none;
  }
  .shortcuts {
    display: grid;
    gap: 8px;
    margin-block: 0;
    padding: 0;
    list-style: none;
  }
  .shortcuts > li > a,
  .mine {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: 12px;
    align-items: center;
    height: 100%;
    min-height: 64px;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--shadow);
    text-decoration: none;
  }
  .shortcuts a:hover {
    border-color: var(--border-strong);
  }
  .mine {
    background: var(--green);
    border-color: var(--green);
    color: var(--on-green);
  }
  .shortcut-icon {
    grid-row: span 2;
    width: 44px;
    height: 44px;
    padding: 10px;
    border-radius: 12px;
    background: var(--soft);
    color: var(--green);
  }
  .mine .shortcut-icon {
    background: var(--lime);
    color: var(--on-lime);
  }
  .shortcuts strong {
    font-size: 17px;
    line-height: 1.25;
    color: var(--green);
  }
  .mine strong {
    color: var(--on-green);
  }
  .shortcuts span {
    font-size: 14px;
    color: var(--muted);
  }
  .mine span {
    color: var(--on-green-2);
  }
  .mine form {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .mine select {
    flex: 1;
    min-width: 0;
    height: 48px;
    padding-inline: 12px;
    border: 0;
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    font-size: 16px;
  }
  .mine .button {
    min-width: 72px;
    background: var(--lime);
    border-color: var(--lime);
    color: var(--on-lime);
  }
  .mine .button:hover {
    background: var(--lime-2);
  }
  .mine :focus-visible {
    outline-color: var(--lime);
  }
  .feed {
    margin-top: 28px;
    scroll-margin-top: 12px;
  }
  .feed-filters {
    display: grid;
    gap: 10px;
  }
  .results-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    margin: 12px 0;
    font-size: 15px;
  }
  .results-info .chip {
    font-size: 12px;
  }
  .period + .period {
    margin-top: 24px;
  }
  .period h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
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
  .item-foot > span:last-child {
    margin-left: auto;
  }
  .method {
    display: grid;
    gap: 12px;
    margin-top: 32px;
  }
  .steps {
    display: grid;
    gap: 12px;
    margin: 0 0 4px;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }
  .steps li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    column-gap: 12px;
    counter-increment: step;
  }
  .steps li::before {
    content: counter(step);
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--green);
    color: var(--lime);
    font-weight: 800;
  }
  .steps span {
    font-size: 14px;
    color: var(--muted);
  }
  @media (min-width: 600px) {
    .proposal-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .home-hero {
      grid-template-columns: 1.4fr 1fr;
      gap: 48px;
      padding-block: 24px;
    }
    .home-hero h1 {
      font-size: 52px;
    }
    .home-hero .hint {
      font-size: 18px;
    }
    .hero-art {
      display: block;
      color: var(--muted);
    }
    .hero-art :global(.congress) {
      display: block;
      width: 100%;
      max-height: 220px;
    }
    .shortcuts {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .feed {
      margin-top: 40px;
    }
    .feed-filters {
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
      align-items: center;
      gap: 16px;
    }
    .proposal-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .method {
      grid-template-columns: 2fr 1fr;
      align-items: start;
    }
    .steps {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
