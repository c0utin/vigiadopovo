<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  import script from "./deputados.js?raw";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head
  ><title>Deputados — Vigia do Povo</title><meta
    name="description"
    content="Perfis dos deputados federais em exercício: partido, estado, situação, votos registrados, proposições, discursos e comissões, com dados oficiais da Câmara."
  /></svelte:head
>

<main id="conteudo" class="wrap page deputies-page">
  <header class="page-head">
    <h1>Deputados</h1>
    {#if data.collectedAt}<p class="snapshot">
        Atualizado em {date(data.collectedAt)}
      </p>{:else}<p class="hint">
        Os perfis ainda não foram gerados nesta versão do site.
      </p>{/if}
  </header>

  <div
    class="filter-bar"
    data-filters
    data-history={asset(
      "deputados-mandatos.json" as Parameters<typeof asset>[0],
    )}
    hidden
  >
    <label class="search-field"
      ><span aria-hidden="true">⌕</span><span class="sr-only"
        >Buscar deputado pelo nome</span
      ><input
        id="busca-deputado"
        type="search"
        autocomplete="off"
        placeholder="Nome do deputado"
      /></label
    >
    <div class="filter-row">
      <label class="sr-only" for="uf">Estado</label>
      <select id="uf" class="select"
        ><option value="">Estado</option>{#each data.states as uf}<option
            >{uf}</option
          >{/each}</select
      >
      <label class="sr-only" for="partido">Partido</label>
      <select id="partido" class="select"
        ><option value="">Partido</option>{#each data.parties as party}<option
            >{party}</option
          >{/each}</select
      >
      <label class="sr-only" for="mandato">Mandato</label>
      <select id="mandato" class="select"
        ><option value="atual">Em exercício</option>{#if data.everyone}<option
            value="todos">Desde 1826</option
          >{/if}{#each data.legislatures as l}<option value={l.id}
            >{l.id}ª · {l.start.slice(0, 4)}–{l.end?.slice(2, 4) ??
              "atual"}</option
          >{/each}</select
      >
    </div>
  </div>
  <p class="count" data-count aria-live="polite">
    {data.deputies.length} deputados em exercício
  </p>

  <ul class="rows">
    {#each data.deputies as d}<li
        class="row tap"
        data-deputy
        data-search={d.search}
        data-party={d.party ?? ""}
        data-state={d.state ?? ""}
        data-legislatures={d.legislatures.join(" ")}
        data-parties={d.parties}
        data-current
      >
        <!-- Photo paths are root-relative; asset() adds the deploy base path. -->
        {#if d.photo}<img
            class="avatar"
            src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
            alt=""
            width="44"
            height="44"
            loading="lazy"
            decoding="async"
          />{:else}<span class="avatar no-photo" aria-hidden="true">◉</span
          >{/if}
        <div class="row-main">
          <a class="row-title clamp-2" href={resolve(`deputados/${d.id}/`)}
            >{d.name}</a
          >
          <p class="row-meta">
            {d.party ?? "Sem partido"} · {d.state ?? "—"}{d.condition &&
            d.condition !== "Titular"
              ? ` · ${d.condition}`
              : ""}
          </p>
        </div>
        {#if d.points !== null}<span class="row-trail"
            ><strong
              >{d.points.toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}</strong
            >
            pts · {d.rank}º</span
          >{/if}
        <span class="chev" aria-hidden="true"></span>
      </li>{/each}
  </ul>
  <p class="hint" data-status hidden></p>
  <button type="button" class="button secondary block" data-more hidden
    >Mostrar mais</button
  >
  <p class="empty-state" data-empty hidden>
    Nenhum deputado com esses filtros.
  </p>
  {#if data.collectedAt}<details class="disclosure">
      <summary>Fontes e downloads</summary>
      <p class="prose">
        Fotos oficiais: Câmara dos Deputados. Dados:
        <a
          href={asset("deputados.json" as Parameters<typeof asset>[0])}
          download>deputados.json ↗</a
        >{#if data.everyone}
          · mandatos desde 1826:
          <a
            href={asset(
              "deputados-mandatos.json" as Parameters<typeof asset>[0],
            )}
            download>deputados-mandatos.json ↗</a
          >{/if}
      </p>
    </details>{/if}
  <AskAI
    href={resolve("deputados-historico.md")}
    what="todos os deputados desde 1826"
  />
</main>
{@html `<script>${script}<\/script>`}

<style>
  .count {
    margin: 8px 0 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }
  .rows {
    margin-top: 8px;
  }
  .filter-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr);
  }
  .filter-row > .select {
    padding-left: 10px;
    padding-right: 24px;
  }
  .rows :global(.no-photo) {
    display: grid;
    place-items: center;
    font-size: 18px;
    color: var(--muted);
  }
  .rows :global(.external) {
    flex: none;
    margin-right: 4px;
    font-size: 18px;
    line-height: 1;
    color: var(--muted);
  }
  .block {
    margin-top: 12px;
  }
  .empty-state {
    margin-top: 12px;
  }
</style>
