<script lang="ts">
  import { resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";
  let { data }: { data: PageData } = $props();
  let p = $derived(data.proposal);
  const votes = $derived(
    p.votes.toSorted((a, b) => b.date.localeCompare(a.date)),
  );
</script>

<svelte:head
  ><title>{p.summary?.title ?? p.label} — Vigia do Povo</title><meta
    name="description"
    content={p.summary?.text ?? p.ementa}
  /></svelte:head
>
<main id="conteudo" class="wrap page proposal">
  <a class="back-link" href={`${resolve("/")}#propostas`}>← Propostas</a>
  <div class="proposal-layout">
    <header class="card proposal-head">
      <p class="item-top">
        <span class="chip plain">{p.summary?.topic ?? p.type}</span><span
          class="item-id">{p.label}</span
        >
      </p>
      <h1>{p.summary?.title ?? p.label}</h1>
      <p class="lead">
        {p.summary?.text ??
          "Ainda não há resumo para esta versão da ementa. Leia abaixo o texto oficial."}
      </p>
      {#if p.summary}<details class="disclosure ai">
          <summary
            ><span class="chip" data-tone="warn">Resumo por IA</span><span
              class="count">sem revisão humana</span
            ></summary
          >
          <p class="prose">
            Resumo por IA, sem revisão humana. Explica só a ementa, não o texto
            completo, e não é aconselhamento jurídico.
          </p>
        </details>{/if}
    </header>

    <aside class="card status-card" aria-labelledby="situacao-titulo">
      <h2 id="situacao-titulo">Situação</h2>
      <p class="status-now">
        <span class="chip" data-tone="info"
          >{p.status?.descricaoSituacao ?? "Não informada pela Câmara"}</span
        >
      </p>
      <ul class="stats mini-stats">
        <li class="stat">
          <span class="stat-value">{votes.length}</span><span class="stat-label"
            >Votações</span
          >
        </li>
        <li class="stat">
          <span class="stat-value small">{date(p.presentedAt)}</span><span
            class="stat-label">Apresentada em</span
          >
        </li>
      </ul>
      <dl class="facts">
        <dt>Último andamento</dt>
        <dd>
          {p.status?.descricaoTramitacao ??
            "Não informado"}{#if p.status?.dataHora}<br /><span class="hint"
              >{date(p.status.dataHora)}{p.status.siglaOrgao
                ? ` · ${p.status.siglaOrgao}`
                : ""}</span
            >{/if}
        </dd>
        <dt>Autoria</dt>
        <dd>
          {p.authors.map((a) => a.name).join("; ") || "Não informada"}
        </dd>
      </dl>
      <div class="button-row">
        <a class="button primary" href={p.url} target="_blank" rel="noreferrer"
          >Acompanhar na Câmara ↗</a
        >{#if p.documentUrl}<a
            class="button secondary"
            href={p.documentUrl}
            target="_blank"
            rel="noreferrer">Ler o texto completo ↗</a
          >{/if}
      </div>
    </aside>

    <div class="proposal-body">
      <section class="card" aria-labelledby="ementa-titulo">
        <h2 id="ementa-titulo">Texto oficial (ementa)</h2>
        <blockquote>{p.ementa}</blockquote>
      </section>

      <section class="card" aria-labelledby="votacoes-titulo">
        <div class="card-head">
          <h2 id="votacoes-titulo">Votações</h2>
          <span class="big-count">{votes.length}</span>
          {#if votes.length}<p class="hint">
              Inclui requerimentos e etapas. Uma votação aprovada não significa
              que a proposta virou lei.
            </p>{/if}
        </div>
        {#if votes.length}<ol class="item-list">
            {#each votes as vote}<li class="item">
                <p class="item-top">
                  <span class="item-id">{date(vote.date)}</span><span
                    class="chip plain outline">{vote.organ}</span
                  >
                </p>
                <p class="item-text">{vote.description}</p>
                <a
                  class="item-link"
                  href={vote.url}
                  target="_blank"
                  rel="noreferrer">Registro oficial ↗</a
                >
              </li>{/each}
          </ol>
          <a class="card-link" href={resolve("dados/")}
            >Ver como cada deputado votou →</a
          >{:else}<p class="hint">
            Nenhuma votação registrada nesta coleta. Isso não prevê se haverá
            votação.
          </p>{/if}
      </section>

      <section class="card" aria-labelledby="detalhes-titulo">
        <h2 id="detalhes-titulo">Mais detalhes</h2>
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
        <AskAI href={resolve(`proposta/${p.id}.md`)} what="esta proposta" />
      </section>
    </div>
  </div>
</main>

<style>
  .proposal-layout {
    display: grid;
    gap: 12px;
  }
  .proposal-head h1 {
    margin-top: 10px;
  }
  .proposal-head .lead {
    margin-bottom: 0;
  }
  .ai {
    margin-bottom: -8px;
  }
  .status-card h2 {
    margin-bottom: 8px;
  }
  .status-now {
    margin-bottom: 12px;
  }
  .status-now .chip {
    font-size: 15px;
    padding: 5px 12px;
  }
  .mini-stats {
    margin-bottom: 14px;
  }
  .stat-value.small {
    font-size: 20px;
    line-height: 1.6;
  }
  .status-card .facts {
    margin-bottom: 14px;
  }
  .big-count {
    font-size: 22px;
    font-weight: 800;
    color: var(--muted);
  }
  blockquote {
    margin: 0;
    padding: 14px 16px;
    border-left: 4px solid var(--lime);
    border-radius: 0 12px 12px 0;
    background: var(--bg);
    font-size: 16px;
    line-height: 1.65;
  }
  .proposal-body > section + section {
    margin-top: 12px;
  }
  .proposal-body .item {
    background: var(--bg);
    border-color: transparent;
  }
  .proposal-body :global(.ask-ai) {
    margin-top: 12px;
  }
  @media (min-width: 600px) {
    .mini-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .proposal-layout {
      grid-template-columns: minmax(0, 1fr) 360px;
      grid-template-areas:
        "head aside"
        "body aside";
      gap: 16px;
      align-items: start;
    }
    .proposal-head {
      grid-area: head;
    }
    .status-card {
      grid-area: aside;
      position: sticky;
      top: 16px;
    }
    .proposal-body {
      grid-area: body;
    }
  }
</style>
