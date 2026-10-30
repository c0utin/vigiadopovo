<script lang="ts">
  import { resolve } from "$app/paths";
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

<main id="conteudo">
  <section class="hero wrap">
    <div class="hero-copy">
      <h1>Entenda a política.<br /><em>Sem complicação.</em></h1>
      <p class="hero-description">
        Propostas da Câmara dos Deputados em palavras simples, com link para a
        fonte oficial. Você forma a sua opinião.
      </p>
    </div>
    <div class="hero-art" aria-hidden="true">
      <Congress />
    </div>
  </section>

  <section id="propostas" class="feed wrap" aria-labelledby="propostas-titulo">
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
      <span data-count aria-live="polite">{portal.total} propostas</span>
      <span>Resumos por IA, sem revisão humana. Proposta não é lei.</span>
    </p>
    {#each portal.periods as period, index}
      <section class="period" data-period aria-labelledby="periodo-{index}">
        <h3 id="periodo-{index}">
          {period.title}
          <span class="period-count" data-period-count
            >{period.propositions.length}</span
          >
        </h3>
        <ul class="proposal-grid" role="list">
          {#each period.propositions as p}
            <li
              class="proposal-card"
              data-search={p.search}
              data-topic={p.topic ?? ""}
            >
              <p class="card-top">
                <span class="topic">{p.topic ?? "Ementa oficial"}</span><span
                  class="proposal-id">{p.label}</span
                >
              </p>
              <h4>
                <a href={resolve(`proposta/${p.id}/`)}>{p.title}</a>
              </h4>
              <p class="card-description">{p.text}</p>
              <p class="card-meta">
                <span>{p.stage ?? "Situação não informada"}</span><span
                  >{p.latest.kind} em {date(p.latest.date)}</span
                >
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

  <section class="method-section" aria-labelledby="metodo-titulo">
    <div class="wrap">
      <h2 id="metodo-titulo">Como funciona</h2>
      <ol class="method-grid">
        <li>
          <strong>Fonte oficial.</strong> Os dados vêm da API de Dados Abertos da
          Câmara, com autoria, datas e links originais.
        </li>
        <li>
          <strong>Linguagem simples.</strong> A IA explica só a ementa, sem inventar
          impactos nem recomendar votos.
        </li>
        <li>
          <strong>Você confere.</strong> Cada proposta mostra o texto oficial e o
          link para acompanhar na Câmara.
        </li>
      </ol>
      <a class="method-link" href={resolve("sobre/")}
        >Fontes, método e limites →</a
      >
    </div>
  </section>
</main>
{@html `<script>${feed}<\/script>`}
