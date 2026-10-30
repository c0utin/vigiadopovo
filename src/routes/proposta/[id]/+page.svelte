<script lang="ts">
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  let { data }: { data: PageData } = $props();
  let p = $derived(data.proposal);
  const votes = $derived(
    p.votes.toSorted((a: { date: string }, b: { date: string }) =>
      b.date.localeCompare(a.date),
    ),
  );
</script>

<svelte:head
  ><title>{p.summary?.title ?? p.label} — Vigia do Povo</title><meta
    name="description"
    content={p.summary?.text ?? p.ementa}
  /></svelte:head
>
<main id="conteudo" class="wrap detail-page">
  <a class="back-link" href="/#propostas">← Propostas</a>
  <div class="detail-layout">
    <header class="detail-head">
      <p class="eyebrow">{p.label} · {p.summary?.topic ?? p.type}</p>
      <h1>{p.summary?.title ?? p.label}</h1>
      <p class="lead">
        {p.summary?.text ??
          "Ainda não há resumo para esta versão da ementa. Leia abaixo o texto oficial."}
      </p>
      {#if p.summary}<p class="ai-note">
          Resumo por IA, sem revisão humana. Explica só a ementa, não o texto
          completo, e não é aconselhamento jurídico.
        </p>{/if}
    </header>

    <aside class="source-panel" aria-labelledby="situacao-titulo">
      <h2 id="situacao-titulo">Situação</h2>
      <dl>
        <dt>Situação atual</dt>
        <dd>{p.status?.descricaoSituacao ?? "Não informada pela Câmara"}</dd>
        <dt>Último andamento</dt>
        <dd>
          {p.status?.descricaoTramitacao ??
            "Não informado"}{#if p.status?.dataHora}<br /><span class="muted"
              >{date(p.status.dataHora)}{p.status.siglaOrgao
                ? ` · ${p.status.siglaOrgao}`
                : ""}</span
            >{/if}
        </dd>
        <dt>Apresentada em</dt>
        <dd>{date(p.presentedAt)}</dd>
        <dt>Autoria</dt>
        <dd>
          {p.authors.map((a: { name: string }) => a.name).join("; ") ||
            "Não informada"}
        </dd>
      </dl>
      <a class="button primary" href={p.url} target="_blank" rel="noreferrer"
        >Acompanhar na Câmara ↗</a
      >{#if p.documentUrl}<a
          class="button secondary"
          href={p.documentUrl}
          target="_blank"
          rel="noreferrer">Ler o texto completo ↗</a
        >{/if}
    </aside>

    <div class="detail-body">
      <h2>Texto oficial (ementa)</h2>
      <blockquote>{p.ementa}</blockquote>

      <h2>Votações <span class="muted">({votes.length})</span></h2>
      {#if votes.length}<p class="muted">
          Inclui requerimentos e etapas. Uma votação aprovada não significa que
          a proposta virou lei.
        </p>
        <ol class="vote-list">
          {#each votes as vote}<li>
              <p class="vote-date">{date(vote.date)} · {vote.organ}</p>
              <p>{vote.description}</p>
              <a href={vote.url} target="_blank" rel="noreferrer"
                >Registro oficial ↗</a
              >
            </li>{/each}
        </ol>
        <a class="read-link" href="/dados/">Ver como cada deputado votou →</a
        >{:else}<p class="muted">
          Nenhuma votação registrada nesta coleta. Isso não prevê se haverá
          votação.
        </p>{/if}

      <h2>Mais detalhes</h2>
      {#if p.status?.despacho}<details>
          <summary>Despacho oficial</summary>
          <p>{p.status.despacho}</p>
        </details>{/if}
      <details>
        <summary>Temas oficiais da Câmara</summary>
        {#if p.labels?.length}<ul>
            {#each p.labels as label}<li>
                <a href={label.sourceUrl}>{label.name}</a>
              </li>{/each}
          </ul>{:else}<p>
            Sem classificação temática oficial nesta coleta.
          </p>{/if}
      </details>
      <details>
        <summary>Sobre estes dados</summary>
        <dl class="data-facts">
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
        <p>
          <a href={p.apiUrl} target="_blank" rel="noreferrer"
            >Dados na API da Câmara ↗</a
          >
          · <a href="/sobre/">Como os resumos são feitos</a> ·
          <a href="/transparencia/">Transparência dos dados</a>
        </p>
      </details>
    </div>
  </div>
</main>
