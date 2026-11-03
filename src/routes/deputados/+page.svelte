<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import script from "./deputados.js?raw";

  let { data }: { data: PageData } = $props();
  // Photo paths are root-relative; asset() adds the deploy base path.
  const photo = (path: string) =>
    asset(path.slice(1) as Parameters<typeof asset>[0]);
</script>

<svelte:head
  ><title>Deputados — Vigia do Povo</title><meta
    name="description"
    content="Perfis dos deputados federais em exercício: partido, estado, situação, votos registrados, proposições, discursos e comissões, com dados oficiais da Câmara."
  /></svelte:head
>

<main id="conteudo" class="wrap deputies-page">
  <div class="section-heading">
    <h1>Deputados</h1>
    {#if data.collectedAt}<p class="snapshot">
        {data.deputies.length} em exercício · atualizado em {date(
          data.collectedAt,
        )}
      </p>{/if}
  </div>
  {#if !data.collectedAt}<p class="muted">
      Os perfis ainda não foram gerados nesta versão do site.
    </p>{/if}
  <p class="intro">
    Perfil de cada deputado federal em exercício, com situação, partido,
    comissões e a atividade registrada pela Câmara no ano{data.year
      ? ` (${data.year})`
      : ""}.
  </p>

  <div class="filters" data-filters hidden>
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
    <label
      ><span class="sr-only">Partido</span><select id="partido"
        ><option value="">Todos os partidos</option
        >{#each data.parties as party}<option>{party}</option>{/each}</select
      ></label
    >
    <label
      ><span class="sr-only">Estado</span><select id="uf"
        ><option value="">Todos os estados</option
        >{#each data.states as uf}<option>{uf}</option>{/each}</select
      ></label
    >
    <p class="count" data-count aria-live="polite"></p>
  </div>

  <ul class="deputy-grid">
    {#each data.deputies as d}<li
        data-deputy
        data-search={d.search}
        data-party={d.party ?? ""}
        data-state={d.state ?? ""}
      >
        <a href={resolve(`deputados/${d.id}/`)}>
          {#if d.photo}<img
              src={photo(d.photo)}
              alt=""
              width="72"
              height="96"
              loading="lazy"
              decoding="async"
            />{:else}<span class="no-photo" aria-hidden="true">◉</span>{/if}
          <span class="info">
            <strong>{d.name}</strong>
            <span>{d.party ?? "Sem partido"} · {d.state ?? "—"}</span>
            {#if d.condition && d.condition !== "Titular"}<span class="tag"
                >{d.condition}</span
              >{/if}
          </span>
        </a>
      </li>{/each}
  </ul>
  <p class="muted" data-empty hidden>Nenhum deputado com esses filtros.</p>
  {#if data.collectedAt}<p class="muted credit">
      Fotos oficiais: Câmara dos Deputados. Dados:
      <a href={asset("deputados.json" as Parameters<typeof asset>[0])} download
        >deputados.json ↗</a
      >
    </p>{/if}
</main>
{@html `<script>${script}<\/script>`}

<style>
  .deputies-page {
    padding-block: 24px 40px;
  }
  h1 {
    font-size: 36px;
    letter-spacing: -1px;
    margin: 0;
  }
  .intro {
    color: var(--muted);
    line-height: 1.6;
    max-width: 680px;
  }
  .filters {
    display: grid;
    gap: 10px;
    margin-block: 16px;
  }
  select {
    width: 100%;
    height: 48px;
    padding-inline: 12px;
    border: 1px solid #8a9a86;
    border-radius: 10px;
    background: #fff;
    color: var(--green);
    font-size: 16px;
  }
  .count {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .deputy-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .deputy-grid a {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 96px;
    padding: 10px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    text-decoration: none;
  }
  .deputy-grid a:hover {
    border-color: #849773;
  }
  img,
  .no-photo {
    flex: none;
    width: 54px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    background: #e5e8d9;
  }
  .no-photo {
    display: grid;
    place-items: center;
    color: #8a9a86;
  }
  .info {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .info strong {
    font-size: 16px;
  }
  .info span {
    font-size: 14px;
    color: var(--muted);
  }
  .info .tag {
    justify-self: start;
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 10px;
    background: #eaf0df;
    color: var(--green);
  }
  .credit {
    margin-top: 20px;
    font-size: 13px;
  }
  @media (min-width: 600px) {
    .filters {
      grid-template-columns: 2fr 1fr 1fr;
      align-items: center;
    }
    .count {
      grid-column: 1 / -1;
    }
    .deputy-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .deputy-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (min-width: 1200px) {
    .deputy-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
