<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  import script from "./deputados.js?raw";

  let { data }: { data: PageData } = $props();
  // Same wording as deputados.js uses for former deputies' cards.
  const served = (list: number[]) =>
    list.length
      ? `Legislaturas: ${list
          .slice(0, 4)
          .map((l) => `${l}ª`)
          .join(", ")}${list.length > 4 ? ` +${list.length - 4}` : ""}`
      : "";
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
        {data.deputies.length} em exercício · atualizado em {date(
          data.collectedAt,
        )}
      </p>{/if}
  </header>
  {#if !data.collectedAt}<p class="hint">
      Os perfis ainda não foram gerados nesta versão do site.
    </p>{/if}
  <p class="lead">
    Toque em um deputado para ver o boletim{data.year
      ? ` de ${data.year}`
      : ""}: pontos, leis, votos e comissões.
  </p>
  {#if data.collectedAt}<a
      class="ranking-cta"
      href={resolve("deputados/ranking/")}
      ><svg
        class="cta-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path
          d="M8 4h8v5a4 4 0 0 1-8 0V4m0 2H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3m-4 2v4m-4 4h8m-6-4h4v4h-4z"
        /></svg
      ><span
        ><strong>Quem mais aprova leis?</strong><span
          >Ranking de qualidade: resultado, não quantidade.</span
        ></span
      ><span aria-hidden="true" class="cta-arrow">→</span></a
    >{/if}

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
            >{l.id}ª · {l.start.slice(0, 4)}–{l.end?.slice(0, 4) ?? "atual"} ({l.deputies})</option
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
    <p class="hint filter-hint">
      No filtro de mandato, veja também quem já foi deputado em cada legislatura
      desde 1826.
    </p>
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
          <!-- Photo paths are root-relative; asset() adds the deploy base path. -->
          {#if d.photo}<img
              src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
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
          {#if d.points !== null}<span class="score"
              ><strong
                >{d.points.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}</strong
              >
              pts<span>{d.rank}º</span></span
            >{/if}
        </a>
      </li>{/each}
  </ul>
  <p class="hint" data-status hidden></p>
  <button type="button" class="more" data-more hidden>Mostrar mais</button>
  <p class="empty-state" data-empty hidden>
    Nenhum deputado com esses filtros.
  </p>
  {#if data.collectedAt}<p class="hint credit">
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
  <AskAI
    href={resolve("deputados-historico.md")}
    what="todos os deputados desde 1826"
  />
</main>
{@html `<script>${script}<\/script>`}

<style>
  .ranking-cta {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    min-height: 64px;
    margin-bottom: 16px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--green);
    color: var(--on-green);
    text-decoration: none;
  }
  .ranking-cta:hover {
    background: var(--green-2);
    color: var(--on-green);
  }
  .cta-icon {
    width: 44px;
    height: 44px;
    padding: 10px;
    border-radius: 12px;
    background: var(--lime);
    color: var(--on-lime);
  }
  .ranking-cta strong {
    display: block;
    font-size: 16px;
  }
  .ranking-cta span span {
    font-size: 13px;
    color: var(--on-green-2);
  }
  .cta-arrow {
    font-size: 22px;
    font-weight: 800;
    color: var(--lime);
  }
  .filters {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }
  select {
    width: 100%;
    height: 50px;
    padding-inline: 12px;
    border: 1.5px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    font-size: 16px;
  }
  .count {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }
  .filter-hint {
    font-size: 13px;
  }
  .deputy-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* :global: deputados.js also builds cards for former deputies. */
  .deputy-grid :global(a) {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 84px;
    padding: 10px 12px 10px 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    text-decoration: none;
  }
  .deputy-grid :global(a:hover) {
    border-color: var(--border-strong);
  }
  .deputy-grid :global(img),
  .deputy-grid :global(.no-photo) {
    flex: none;
    width: 48px;
    height: 64px;
    border-radius: 10px;
    object-fit: cover;
    background: var(--surface-alt);
  }
  .deputy-grid :global(.no-photo) {
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .deputy-grid :global(.info) {
    display: grid;
    flex: 1;
    gap: 2px;
    min-width: 0;
  }
  .deputy-grid :global(.info strong) {
    font-size: 16px;
    line-height: 1.25;
    color: var(--green);
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
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--info-bg);
    color: var(--info-fg);
  }
  .deputy-grid :global(.info .tag.former) {
    background: var(--closed-bg);
    color: var(--closed-fg);
  }
  .score {
    flex: none;
    display: grid;
    justify-items: end;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }
  .score strong {
    font-size: 18px;
    color: var(--green);
    font-variant-numeric: tabular-nums;
  }
  .score span {
    font-size: 12px;
    font-weight: 700;
  }
  .more {
    display: block;
    margin: 16px auto 0;
    min-height: 48px;
    padding: 0 22px;
    border: 1.5px solid var(--green);
    border-radius: 12px;
    background: var(--surface);
    color: var(--green);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .empty-state {
    margin-top: 12px;
  }
  .credit {
    margin-block: 20px 12px;
    font-size: 13px;
  }
  @media (min-width: 600px) {
    .filters {
      grid-template-columns: 1.4fr 2fr 1fr 1fr;
      align-items: center;
    }
    .count,
    .filter-hint {
      grid-column: 1 / -1;
    }
    .deputy-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .ranking-cta {
      max-width: 560px;
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
