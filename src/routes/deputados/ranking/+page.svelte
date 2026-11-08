<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import RankRange from "#lib/RankRange.svelte";

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
  const top = $derived(data.rows[0]?.points || 1);
</script>

<svelte:head
  ><title>Ranking de qualidade legislativa — Vigia do Povo</title><meta
    name="description"
    content="Ranking dos deputados federais por resultados legislativos ponderados pela qualidade dos projetos, não pela quantidade. Fórmula pública, dados oficiais da Câmara e cálculo reproduzível."
  /></svelte:head
>

<main id="conteudo" class="wrap page ranking-page">
  <a class="back-link" href={resolve("deputados/")}>← Deputados</a>
  <header class="page-head">
    <p class="eyebrow">Ranking de qualidade legislativa</p>
    <h1>Quem mais aprova leis?</h1>
    {#if data.collectedAt}<p class="snapshot">
        {data.rows.length} em exercício · atualizado em {date(data.collectedAt)}
      </p>{/if}
  </header>
  {#if !q}<p class="hint">
      O ranking ainda não foi gerado nesta versão do site.
    </p>{:else}
    <ul class="legend card" aria-label="Como ler o ranking">
      <li>
        <strong>Pontos</strong>
        <span
          >Só projeto aprovado pela Câmara ou que virou lei. Apresentar não
          conta.</span
        >
      </li>
      <li>
        <span class="bar" aria-hidden="true"
          ><span style:--value={60}></span></span
        >
        <span>Pontos comparados aos do 1º colocado.</span>
      </li>
      <li>
        <RankRange rank={2} range={[1, 4]} total={8} />
        <span
          >Faixa: melhor e pior posição sob {q.variants.length} conjuntos de pesos
          alternativos.</span
        >
      </li>
      <li>
        <strong>+N</strong>
        <span>Leis e aprovações por outro projeto, contadas à parte.</span>
      </li>
    </ul>

    <nav class="section-nav" aria-label="Seções do ranking">
      <ol>
        <li><a href="#lista">Ranking</a></li>
        <li><a href="#metodo">Fórmula</a></li>
        <li><a href="#pesos">Pesos</a></li>
        <li><a href="#reprodutivel">Conferir</a></li>
        <li><a href="#limites">Limites</a></li>
      </ol>
    </nav>

    <section id="lista" class="card list-card" aria-labelledby="lista-titulo">
      <h2 id="lista-titulo" class="sr-only">Classificação</h2>
      <table class="data-table rank-table">
        <caption class="sr-only"
          >Deputados em exercício por pontos de qualidade</caption
        >
        <thead>
          <tr>
            <th scope="col" class="num">Posição</th>
            <th scope="col">Deputado</th>
            <th scope="col" class="num">Pontos</th>
            <th scope="col">Faixa</th>
            <th scope="col" class="num">Autoria</th>
            <th scope="col" class="num">Relatoria</th>
            <th
              scope="col"
              class="num"
              title="Viraram lei, como autor ou coautor (+ por outro projeto)"
              >Leis</th
            >
            <th
              scope="col"
              class="num"
              title="Aprovados pela Câmara, ainda não lei (+ por outro projeto)"
              >Aprovados</th
            >
            <th scope="col" class="num" title="Projetos apresentados"
              >Apresentados</th
            >
          </tr>
        </thead>
        <tbody>
          {#each data.rows as r}<tr>
              <td class="num rank">{r.rank}º</td>
              <th scope="row" class="name"
                ><a href={resolve(`deputados/${r.id}/`)}>{r.name}</a>
                <span class="party">{r.party ?? "sem partido"}-{r.state}</span
                ><span class="bar" aria-hidden="true"
                  ><span style:--value={(r.points / top) * 100}></span></span
                ></th
              >
              <td class="num pts"
                ><a
                  href={`${resolve(`deputados/${r.id}/`)}#qualidade`}
                  title="Ver o cálculo linha a linha"
                  ><strong>{number(r.points)}</strong><span class="unit">
                    pts</span
                  ></a
                ></td
              >
              <td class="range"
                ><span class="range-label"
                  ><span class="mobile-only">Faixa&nbsp;</span>{range(
                    r.rankRange,
                  )}</span
                ><RankRange
                  rank={r.rank}
                  range={r.rankRange}
                  total={data.rows.length}
                /></td
              >
              <td class="num mini" data-label="Autoria"
                >{number(r.authorPoints)}</td
              >
              <td class="num mini" data-label="Relatoria"
                >{number(r.reportPoints)}</td
              >
              <td class="num mini" data-label="Leis"
                >{r.laws}{#if r.lawVia}<span class="via"
                    >+{r.lawVia}<span class="sr-only">
                      por outro projeto</span
                    ></span
                  >{/if}</td
              >
              <td class="num mini" data-label="Aprovados"
                >{r.approved}{#if r.approvedVia}<span class="via"
                    >+{r.approvedVia}<span class="sr-only">
                      por outro projeto</span
                    ></span
                  >{/if}</td
              >
              <td class="num mini muted-cell" data-label="Apresentados"
                >{r.filed}</td
              >
            </tr>{/each}
        </tbody>
      </table>
    </section>

    <div class="page-sections method">
      <section id="metodo" class="card" aria-labelledby="metodo-titulo">
        <h2 id="metodo-titulo">Como os pontos são calculados?</h2>
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
        <table class="data-table stage-table">
          <caption class="sr-only">Pontos da etapa</caption>
          <thead>
            <tr>
              <th scope="col">Etapa</th>
              <th scope="col" class="num">Autor</th>
              <th scope="col">Relator</th>
            </tr>
          </thead>
          <tbody>
            <tr
              ><th scope="row"
                ><span class="chip" data-tone="law">Virou lei</span></th
              ><td class="num">{q.points.law}</td><td
                >relator: {q.reportPoints.law}</td
              ></tr
            >
            <tr
              ><th scope="row"
                ><span class="chip" data-tone="approved"
                  >Aprovado pela Câmara</span
                ></th
              ><td class="num">{q.points.camara}</td><td
                >relator: {q.reportPoints.camara}</td
              ></tr
            >
            <tr
              ><th scope="row"
                ><span class="chip" data-tone="lawVia"
                  >Virou lei por outro projeto</span
                ></th
              ><td class="num">{q.points.lawVia}</td><td class="hint"
                >dividido entre todos os anexados</td
              ></tr
            >
            <tr
              ><th scope="row"
                ><span class="chip" data-tone="approvedVia"
                  >Aprovado por outro projeto</span
                ></th
              ><td class="num">{q.points.approvedVia}</td><td class="hint"
                >dividido entre todos os anexados</td
              ></tr
            >
            <tr
              ><th scope="row"
                ><span class="chip" data-tone="closed"
                  >Qualquer etapa anterior</span
                ></th
              ><td class="num">0</td><td class="hint"
                >apresentar, ter relator ou parecer não pontua</td
              ></tr
            >
          </tbody>
        </table>
        <details class="disclosure">
          <summary>Ver exemplos</summary>
          <div class="prose">
            <p>
              <strong>Pontos do deputado</strong> = soma, em cada projeto de que
              é proponente, de
              <code>peso × pontos da etapa ÷ número de proponentes</code>
              + soma, em cada projeto que relatou, de
              <code>peso × pontos da relatoria ÷ número de relatores</code>.
            </p>
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
        </details>
        <details class="disclosure">
          <summary>Projetos anexados</summary>
          <p class="prose">
            Quando a Câmara aprova um projeto, os anexados a ele são arquivados.
            Eles dividem um só crédito, para que protocolar cópias de um tema em
            votação não multiplique pontos.
          </p>
        </details>
      </section>

      <section id="pesos" class="card" aria-labelledby="pesos-titulo">
        <h2 id="pesos-titulo">Quanto vale cada projeto?</h2>
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
        <ul class="item-list">
          {#each q.reasons as r}<li class="item">
              <p class="item-top">
                <span
                  class="chip"
                  data-tone={r.key === "copy" || r.key === "returned"
                    ? "warn"
                    : "neutral"}>{r.label}</span
                >
              </p>
              <p class="item-text">{r.description}</p>
              <details class="disclosure source">
                <summary>Fundamento</summary>
                <p class="prose">{r.source}</p>
              </details>
            </li>{/each}
        </ul>
        <details class="disclosure">
          <summary
            >Etapas, lidas da situação oficial e dos documentos do projeto</summary
          >
          <ol class="prose">
            {#each q.stages as s}<li>
                <strong>{s.label}.</strong>
                {s.description}
              </li>{/each}
          </ol>
        </details>
        <details class="disclosure">
          <summary
            >Pesos alternativos (faixa) <span class="count"
              >{q.variants.length}</span
            ></summary
          >
          <p class="prose">
            Uma faixa larga quer dizer que a posição depende de escolhas de
            peso; compare faixas, não só posições.
          </p>
          <ul class="prose">
            {#each q.variants as v}<li>{v.label}</li>{/each}
          </ul>
        </details>
      </section>

      <section
        id="reprodutivel"
        class="card"
        aria-labelledby="reprodutivel-titulo"
      >
        <h2 id="reprodutivel-titulo">Como conferir?</h2>
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
        <details class="disclosure">
          <summary>Como conferir</summary>
          <p class="prose">
            O cálculo é uma função pura das regras (versão {q.version}) e de uma
            entrada publicada: sem relógio, rede, sorteio ou ordenação
            dependente do idioma da máquina. A mesma entrada dá sempre o mesmo
            resultado, qualquer que seja a ordem dos registros. Baixe a entrada
            e rode <code>pnpm data:quality</code>: o resultado deve ter o
            SHA-256 acima.
          </p>
        </details>
      </section>

      <section id="limites" class="card" aria-labelledby="limites-titulo">
        <h2 id="limites-titulo">O que o ranking não mede?</h2>
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
      </section>
    </div>
  {/if}
</main>

<style>
  .page-head h1 {
    max-width: 18ch;
  }
  .legend {
    display: grid;
    gap: 12px;
    margin: 0 0 12px;
    list-style: none;
  }
  .legend li {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    font-size: 14px;
    color: var(--muted);
  }
  .legend strong {
    color: var(--green);
    font-size: 16px;
  }
  .legend :global(.range-track) {
    min-width: 0;
  }
  .list-card {
    margin-top: 12px;
    padding: 4px 0;
  }
  .rank-table {
    font-size: 15px;
  }
  .rank-table thead th {
    position: sticky;
    top: 60px;
    z-index: 1;
    background: var(--surface);
    white-space: nowrap;
  }
  .rank-table tbody tr:hover {
    background: var(--surface-alt);
  }
  .rank {
    font-size: 18px;
    font-weight: 800;
    color: var(--green);
  }
  .name {
    min-width: 200px;
  }
  .name a {
    font-weight: 700;
    text-decoration: none;
  }
  .name a:hover {
    text-decoration: underline;
  }
  .party {
    margin-left: 6px;
    font-size: 13px;
    font-weight: 400;
    color: var(--muted);
  }
  .name .bar {
    margin-top: 8px;
    height: 6px;
  }
  .pts a {
    display: inline-flex;
    align-items: baseline;
    min-height: 32px;
    text-decoration: none;
  }
  .pts strong {
    font-size: 18px;
  }
  .unit {
    font-size: 12px;
    color: var(--muted);
  }
  .range {
    min-width: 150px;
  }
  .range-label {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
  .mobile-only {
    display: none;
  }
  .via {
    margin-left: 3px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }
  .muted-cell {
    color: var(--muted);
  }
  .rank-table th:first-child,
  .rank-table td:first-child {
    padding-left: 16px;
  }
  .rank-table th:last-child,
  .rank-table td:last-child {
    padding-right: 16px;
  }
  @media (max-width: 899px) {
    .rank-table thead {
      display: none;
    }
    .rank-table tbody tr {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
      padding: 12px 16px 12px 64px;
      border-bottom: 1px solid var(--line);
    }
    .rank-table tbody th,
    .rank-table tbody td {
      padding: 0 !important;
      border: 0;
    }
    .rank {
      position: absolute;
      top: 12px;
      left: 12px;
      width: 44px;
      text-align: left !important;
      font-size: 20px;
    }
    .name {
      flex: 1 1 calc(100% - 110px);
      min-width: 0;
    }
    .name .party {
      display: block;
      margin: 0;
    }
    .pts strong {
      font-size: 20px;
    }
    .range {
      display: flex;
      flex: 1 1 100%;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .range-label {
      flex: none;
      min-width: 108px;
      margin: 0;
      font-weight: 600;
    }
    .range :global(.range-track) {
      flex: 1;
      min-width: 0;
    }
    .mobile-only {
      display: inline;
    }
    .mini {
      font-size: 13px;
      text-align: left !important;
    }
    .mini::before {
      content: attr(data-label) " ";
      color: var(--muted);
    }
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
  .stage-table {
    margin-top: 8px;
  }
  .stage-table td {
    vertical-align: middle;
  }
  .stage-table td.num {
    font-size: 20px;
    font-weight: 800;
  }
  .reach {
    margin-block: 6px 8px;
  }
  .reach .stat {
    align-items: center;
    padding: 8px;
  }
  #pesos h3 {
    margin-top: 16px;
  }
  .source {
    margin-top: 0;
  }
  .source > summary {
    min-height: 44px;
    font-size: 14px;
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
    .legend {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .reach {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (min-width: 1100px) {
    .legend {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .rank-table thead th {
      top: 60px;
    }
    .method {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    .method > section {
      margin-top: 0;
    }
  }
</style>
