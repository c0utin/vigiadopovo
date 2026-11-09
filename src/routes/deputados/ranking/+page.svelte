<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";

  let { data }: { data: PageData } = $props();
  const q = $derived(data.quality);
  // Absent before rules version 3.
  const unresolved = $derived(q?.unresolvedPrincipals ?? []);
  const unresolvedBills = $derived(
    unresolved.reduce((sum, u) => sum + u.bills, 0),
  );
  const number = (value: number) =>
    value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const range = (r: [number, number]) =>
    r[0] === r[1] ? `${r[0]}º` : `${r[0]}º–${r[1]}º`;
  // Progressive enhancement: without JavaScript every deputy stays listed.
  const searchScript = `(() => {
  const clean = (value) => value.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase().trim();
  const search = document.querySelector("[data-search]");
  const input = document.querySelector("#busca");
  const more = document.querySelector("details.more");
  const rows = [...document.querySelectorAll("[data-name]")];
  const empty = document.querySelector("[data-empty]");
  search.hidden = false;
  input.addEventListener("input", () => {
    const query = clean(input.value);
    let shown = 0;
    for (const row of rows) {
      row.hidden = !clean(row.dataset.name).includes(query);
      if (!row.hidden) shown++;
    }
    if (query && more) more.open = true;
    empty.hidden = shown > 0;
  });
})();`;
</script>

<svelte:head
  ><title>Ranking de qualidade legislativa — Vigia do Povo</title><meta
    name="description"
    content="Ranking dos deputados federais por resultados legislativos ponderados pela qualidade dos projetos, não pela quantidade. Fórmula pública, dados oficiais da Câmara e cálculo reproduzível."
  /></svelte:head
>

{#snippet row(r: PageData["rows"][number])}
  <li class="row tap" data-name={r.name}>
    <span class="pos">{r.rank}º</span>
    <div class="row-main">
      <a
        class="row-title clamp-2"
        href={`${resolve(`deputados/${r.id}/`)}#qualidade`}>{r.name}</a
      >
      <p class="row-meta clamp-2">
        {r.party ?? "sem partido"} · {r.state} · faixa {range(r.rankRange)}
      </p>
    </div>
    <span class="row-trail"><strong>{number(r.points)}</strong> pts</span>
    <span class="chev" aria-hidden="true"></span>
  </li>
{/snippet}

<main id="conteudo" class="wrap page ranking-page">
  <header class="page-head">
    <h1>Quem mais aprova leis?</h1>
    {#if q}
      {#if data.collectedAt}<p class="snapshot">
          {data.rows.length} deputados em exercício · atualizado em {date(
            data.collectedAt,
          )}
        </p>{/if}
      <p class="caveat">
        Só pontua projeto aprovado pela Câmara ou que virou lei.
      </p>
    {:else}
      <p class="hint">O ranking ainda não foi gerado nesta versão do site.</p>
      <a class="button secondary" href={resolve("deputados/")}
        >Ver os deputados</a
      >
    {/if}
  </header>

  {#if q}
    <label class="search-field" data-search hidden
      ><span aria-hidden="true">⌕</span><span class="sr-only"
        >Buscar deputado</span
      ><input
        id="busca"
        type="search"
        autocomplete="off"
        placeholder="Buscar deputado"
      /></label
    >
    <p class="hint" data-empty hidden>Nenhum deputado encontrado.</p>

    <ol class="rows" aria-label="Classificação dos deputados">
      {#each data.rows.slice(0, 20) as r}{@render row(r)}{/each}
    </ol>
    {#if data.rows.length > 20}
      <details class="more">
        <summary>Ver todos ({data.rows.length})</summary>
        <ol class="rows" start="21" aria-label="Classificação dos deputados">
          {#each data.rows.slice(20) as r}{@render row(r)}{/each}
        </ol>
      </details>
    {/if}

    <h2>Como o ranking funciona</h2>
    <div class="accordion">
      <details class="disclosure">
        <summary>Como os pontos são calculados?</summary>
        <p class="formula">
          <span>Pontos de um projeto =</span>
          <code>peso × pontos da etapa ÷ proponentes</code>
          <span>Pontos de uma relatoria =</span>
          <code>peso × pontos da relatoria ÷ relatores</code>
        </p>
        <p class="hint">
          Soma de todos os projetos de que o deputado é proponente e de todos os
          que relatou, desde {date(data.since)}.
        </p>
        <p class="hint">
          Os pontos vêm só de projetos aprovados pela Câmara ou que viraram lei;
          apresentar não conta.
        </p>
        <p class="hint">
          Faixa: melhor e pior posição sob {q.variants.length} conjuntos de pesos
          alternativos.
        </p>
        <ul class="rows bare" aria-label="Pontos por etapa">
          <li class="row">
            <div class="row-main">
              <p class="row-title">
                <span data-tone="law"><span class="dot"></span> Virou lei</span>
              </p>
            </div>
            <span class="row-trail"
              >autor {q.points.law} · relator {q.reportPoints.law}</span
            >
          </li>
          <li class="row">
            <div class="row-main">
              <p class="row-title">
                <span data-tone="approved"
                  ><span class="dot"></span> Aprovado pela Câmara</span
                >
              </p>
            </div>
            <span class="row-trail"
              >autor {q.points.camara} · relator {q.reportPoints.camara}</span
            >
          </li>
          <li class="row">
            <div class="row-main">
              <p class="row-title">
                <span data-tone="lawVia"
                  ><span class="dot"></span> Virou lei por outro projeto</span
                >
              </p>
              <p class="row-meta">Relator: dividido entre todos os anexados</p>
            </div>
            <span class="row-trail">autor {q.points.lawVia}</span>
          </li>
          <li class="row">
            <div class="row-main">
              <p class="row-title">
                <span data-tone="approvedVia"
                  ><span class="dot"></span> Aprovado por outro projeto</span
                >
              </p>
              <p class="row-meta">Relator: dividido entre todos os anexados</p>
            </div>
            <span class="row-trail">autor {q.points.approvedVia}</span>
          </li>
          <li class="row">
            <div class="row-main">
              <p class="row-title">
                <span data-tone="closed"
                  ><span class="dot"></span> Qualquer etapa anterior</span
                >
              </p>
              <p class="row-meta">
                Apresentar, ter relator ou parecer não pontua
              </p>
            </div>
            <span class="row-trail">autor 0</span>
          </li>
        </ul>
        <h3>Exemplos</h3>
        <div class="prose">
          <ul>
            <li>
              Um PL que virou lei, com 2 deputados proponentes:
              <code>1 × {q.points.law} ÷ 2 = {number(q.points.law / 2)}</code>
              pontos para cada um.
            </li>
            <li>
              Uma PEC aprovada pela Câmara, com 1 proponente:
              <code
                >{q.weights.reach.PEC} × {q.points.camara} = {number(
                  q.weights.reach.PEC * q.points.camara,
                )}</code
              >.
            </li>
            <li>
              Um honorífico que virou lei:
              <code
                >{number(q.weights.low)} × {q.points.law} = {number(
                  q.weights.low * q.points.law,
                )}</code
              >.
            </li>
          </ul>
          <p>
            Cada parcela é arredondada a centavos de ponto e o total é a soma
            exata delas. Toque nos pontos de um deputado para ver todas as
            parcelas dele.
          </p>
        </div>
        <h3>Projetos anexados</h3>
        <p class="prose">
          Quando a Câmara aprova um projeto, os anexados a ele são arquivados.
          Eles dividem um só crédito, para que protocolar cópias de um tema em
          votação não multiplique pontos.
        </p>
      </details>

      <details class="disclosure">
        <summary>Quanto vale cada projeto?</summary>
        <p class="hint">Alcance da norma</p>
        <ul class="stats reach">
          {#each Object.entries(q.weights.reach) as [type, w]}<li class="stat">
              <span class="stat-value">{number(w)}</span><span
                class="stat-label">{type}</span
              >
            </li>{/each}
        </ul>
        <p class="hint">
          A emenda à Constituição muda a norma mais alta; a lei complementar
          exige maioria absoluta.
        </p>
        <h3>Peso reduzido ou zerado</h3>
        <ul class="rows bare" aria-label="Pesos reduzidos ou zerados">
          {#each q.reasons as r}<li class="row">
              <div class="row-main">
                <p class="row-title">
                  <span
                    class="chip"
                    data-tone={r.key === "copy" || r.key === "returned"
                      ? "warn"
                      : "neutral"}>{r.label}</span
                  >
                </p>
                <p class="row-text">{r.description}</p>
                <p class="hint">Fundamento: {r.source}</p>
              </div>
            </li>{/each}
        </ul>
        <h3>Etapas, lidas da situação oficial e dos documentos do projeto</h3>
        <ol class="prose">
          {#each q.stages as s}<li>
              <strong>{s.label}.</strong>
              {s.description}
            </li>{/each}
        </ol>
        <h3>Pesos alternativos (faixa)</h3>
        <p class="prose">
          Uma faixa larga quer dizer que a posição depende de escolhas de peso;
          compare faixas, não só posições.
        </p>
        <ul class="prose">
          {#each q.variants as v}<li>{v.label}</li>{/each}
        </ul>
      </details>

      <details class="disclosure">
        <summary>Como conferir?</summary>
        <p class="answer">Reprodutível byte a byte.</p>
        <p class="hint">
          Regras versão {q.version}. A mesma entrada dá sempre o mesmo
          resultado.
        </p>
        <dl class="hashes">
          <dt>
            {#if data.inputPublished}<a
                href={asset(q.input as Parameters<typeof asset>[0])}
                >Entrada do cálculo ↓</a
              >{:else}Entrada do cálculo (não incluída nesta cópia do site){/if}
          </dt>
          <dd><code class="hash">SHA-256 {q.inputSha256}</code></dd>
          <dt>Resultado de <code>pnpm data:quality</code></dt>
          <dd><code class="hash">SHA-256 {q.outputSha256}</code></dd>
        </dl>
        <p class="prose">
          O cálculo é uma função pura das regras (versão {q.version}) e de uma
          entrada publicada: sem relógio, rede, sorteio ou ordenação dependente
          do idioma da máquina. A mesma entrada dá sempre o mesmo resultado,
          qualquer que seja a ordem dos registros. Baixe a entrada e rode
          <code>pnpm data:quality</code>: o resultado deve ter o SHA-256 acima.
        </p>
      </details>

      <details class="disclosure">
        <summary>O que o ranking não mede?</summary>
        <ul class="prose limits">
          <li>
            Mede resultado legislativo, não o mérito político de um projeto, nem
            fiscalização, votos ou trabalho fora da autoria e da relatoria.
          </li>
          <li>
            Quem preside comissões, a Mesa ou lidera governo e oposição tem mais
            chance de aprovar projetos; a posição reflete também esse poder.
          </li>
          <li>
            Relatorias de projetos apresentados antes de {data.since.slice(
              0,
              4,
            )}
            só contam quando há redação final publicada desde então.
          </li>
          {#if unresolvedBills}<li>
              {number(unresolvedBills)}
              {unresolvedBills === 1
                ? "projeto arquivado cita como aprovado um projeto que nenhuma fonte oficial identifica e fica"
                : "projetos arquivados citam como aprovado um projeto que nenhuma fonte oficial identifica e ficam"}
              sem os pontos dele:
              {unresolved.map((u) => `${u.label} (${u.bills})`).join(", ")}.
            </li>{/if}
        </ul>
      </details>
    </div>
  {/if}
</main>
{#if q}{@html `<script>${searchScript}<\/script>`}{/if}

<style>
  .pos {
    flex: none;
    width: 40px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--green);
  }
  /* The snapshot fits one line on a 390px phone. */
  .page-head .snapshot {
    font-size: 12.5px;
  }
  .search-field {
    margin-bottom: 12px;
  }
  .ranking-page > h2 {
    margin-top: 28px;
  }
  /* A list with every row filtered out takes no room. */
  .rows:not(:has(.row:not([hidden]))) {
    display: none;
  }
  .formula {
    display: grid;
    gap: 4px;
    margin-bottom: 8px;
    padding: 12px;
    border-radius: 12px;
    background: var(--green);
    color: var(--on-green);
    font-size: 14px;
  }
  .formula code {
    margin-bottom: 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--lime);
  }
  .accordion > .disclosure > :not(summary) {
    max-width: 70ch;
  }
  .reach {
    margin-block: 6px 8px;
  }
  .reach .stat {
    align-items: center;
    padding: 8px;
  }
  .hashes {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
  }
  .hashes dt {
    margin-top: 8px;
    font-weight: 700;
  }
  .hashes dt a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .hashes dd {
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--bg);
  }
  .limits {
    margin: 0;
  }
  @media (min-width: 600px) {
    .reach {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
