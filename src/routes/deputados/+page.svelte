<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import script from "./deputados.js?raw";

  let { data }: { data: PageData } = $props();
  // Photo paths are root-relative; asset() adds the deploy base path.
  const photo = (path: string) =>
    asset(path.slice(1) as Parameters<typeof asset>[0]);
  // Same wording as deputados.js uses for former deputies' cards.
  const served = (list: number[]) =>
    list.length
      ? `Legislaturas: ${list
          .slice(0, 4)
          .map((l) => `${l}ª`)
          .join(", ")}${list.length > 4 ? ` +${list.length - 4}` : ""}`
      : "";
  const period = (l: { start: string; end: string | null }) =>
    `${l.start.slice(0, 4)}–${l.end?.slice(0, 4) ?? "atual"}`;
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
      : ""}. No filtro de mandato, veja também quem já foi deputado em cada
    legislatura desde 1826.
  </p>

  <div
    class="filters"
    data-filters
    data-history={asset(
      "deputados-mandatos.json" as Parameters<typeof asset>[0],
    )}
    hidden
  >
    <label
      ><span class="sr-only">Mandato</span><select id="mandato"
        ><option value="atual">Em exercício agora</option
        >{#if data.everyone}<option value="todos"
            >Todos que já exerceram ({data.everyone.toLocaleString(
              "pt-BR",
            )})</option
          >{/if}{#each data.legislatures as l}<option value={l.id}
            >{l.id}ª · {period(l)} ({l.deputies})</option
          >{/each}</select
      ></label
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
        data-legislatures={d.legislatures.join(" ")}
        data-parties={d.parties}
        data-current
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
            {#if d.legislatures.length}<span class="served"
                >{served(d.legislatures)}</span
              >{/if}
            {#if d.condition && d.condition !== "Titular"}<span class="tag"
                >{d.condition}</span
              >{/if}
          </span>
        </a>
      </li>{/each}
  </ul>
  <p class="muted" data-status hidden></p>
  <button type="button" class="more" data-more hidden>Mostrar mais</button>
  <p class="muted" data-empty hidden>Nenhum deputado com esses filtros.</p>
  {#if data.collectedAt}<p class="muted credit">
      Fotos oficiais: Câmara dos Deputados. Dados:
      <a href={asset("deputados.json" as Parameters<typeof asset>[0])} download
        >deputados.json ↗</a
      >{#if data.everyone}
        · mandatos desde 1826:
        <a
          href={asset("deputados-mandatos.json" as Parameters<typeof asset>[0])}
          download>deputados-mandatos.json ↗</a
        >{/if}
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
  /* :global: deputados.js also builds cards for former deputies. */
  .deputy-grid :global(a) {
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
  .deputy-grid :global(a:hover) {
    border-color: #849773;
  }
  .deputy-grid :global(img),
  .deputy-grid :global(.no-photo) {
    flex: none;
    width: 54px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    background: #e5e8d9;
  }
  .deputy-grid :global(.no-photo) {
    display: grid;
    place-items: center;
    color: #8a9a86;
  }
  .deputy-grid :global(.info) {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .deputy-grid :global(.info strong) {
    font-size: 16px;
  }
  .deputy-grid :global(.info span) {
    font-size: 14px;
    color: var(--muted);
  }
  .deputy-grid :global(.info .served) {
    font-size: 13px;
  }
  .deputy-grid :global(.info .tag) {
    justify-self: start;
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 10px;
    background: #eaf0df;
    color: var(--green);
  }
  .deputy-grid :global(.info .tag.former) {
    background: #efe9dc;
    color: #6b5a3a;
  }
  .more {
    display: block;
    margin: 16px auto 0;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid #8a9a86;
    border-radius: 10px;
    background: #fff;
    color: var(--green);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .more:hover {
    border-color: var(--green);
  }
  .credit {
    margin-top: 20px;
    font-size: 13px;
  }
  @media (min-width: 600px) {
    .filters {
      grid-template-columns: 1.4fr 2fr 1fr 1fr;
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
