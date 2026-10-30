<script lang="ts">
  import type { PageData } from "./$types";
  import { date } from "#lib/format.ts";
  let { data }: { data: PageData } = $props();
  let p = $derived(data.proposal);
</script>

<svelte:head
  ><title>{p.summary?.title ?? p.label} — Vigia do Povo</title><meta
    name="description"
    content={p.summary?.text ?? p.ementa}
  /></svelte:head
>
<main id="conteudo" class="wrap detail-page">
  <a class="back-link" href="/#propostas">← Todas as propostas</a>
  <div class="detail-layout">
    <article>
      <p class="eyebrow">
        {p.label} <span> / </span>
        {p.summary?.topic ?? p.type}
      </p>
      <h1>{p.summary?.title ?? p.label}</h1>
      <div class="detail-tags">
        <span class="topic">{p.type}</span><span class="ai-label"
          >{p.summary
            ? "Resumo por IA · não revisado"
            : "Resumo pendente"}</span
        >
      </div>
      <h2>Em poucas palavras</h2>
      <p class="lead">
        {p.summary?.text ??
          "Ainda não há um resumo válido para esta versão da ementa. Consulte abaixo a informação oficial."}
      </p>
      <aside class="notice">
        <strong>Entender não é substituir o original.</strong>
        <p>
          Este resumo explica apenas a ementa, não o texto integral, emendas ou
          substitutivos. Não é aconselhamento jurídico. Uma proposta ou etapa
          aprovada não significa que exista uma lei em vigor.
        </p>
      </aside>
      <h2>O que diz a ementa oficial</h2>
      <blockquote>{p.ementa}</blockquote>
      <a class="read-link" href={p.apiUrl} target="_blank" rel="noreferrer"
        >Conferir ementa na API da Câmara ↗</a
      >
      <h2>Classificação temática oficial</h2>
      <p class="muted">
        Rótulos da Câmara para agrupamento de propostas, não classificação
        gerada por IA.
      </p>
      <ul>
        {#each p.labels ?? [] as label}<li>
            <a href={label.sourceUrl}>{label.name}</a> · <code>{label.id}</code>
          </li>{:else}<li>
            Sem classificação temática oficial nesta coleta.
          </li>{/each}
      </ul>
      <a class="read-link" href="/dados/"
        >Explorar temas e votos individuais →</a
      >
      <h2>Situação e último andamento</h2>
      <dl class="status-list">
        <div>
          <dt>Situação na fonte</dt>
          <dd>{p.status?.descricaoSituacao ?? "Não informada pela Câmara"}</dd>
        </div>
        <div>
          <dt>Última etapa</dt>
          <dd>{p.status?.descricaoTramitacao ?? "Não informada"}</dd>
        </div>
        <div>
          <dt>Data do andamento</dt>
          <dd>{date(p.status?.dataHora)}</dd>
        </div>
        <div>
          <dt>Órgão responsável</dt>
          <dd>{p.status?.siglaOrgao ?? "Não informado"}</dd>
        </div>
      </dl>
      {#if p.status?.despacho}<details>
          <summary>Ler despacho oficial</summary>
          <p>{p.status.despacho}</p>
        </details>{/if}
      <h2>
        Votações relacionadas <span class="muted">({p.votes.length})</span>
      </h2>
      <p class="muted">
        São registros associados à proposta, inclusive requerimentos e etapas. O
        resultado abaixo não comprova sanção ou vigência.
      </p>
      {#each p.votes.toSorted( (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date) ) as vote}<article
          class="vote-row"
        >
          <p class="eyebrow">{date(vote.date)} · {vote.organ}</p>
          <p>{vote.description}</p>
          <a href={vote.url} target="_blank" rel="noreferrer"
            >Registro oficial da votação ↗</a
          >
        </article>{:else}<div class="notice">
          Nenhuma votação retornada pela API nesta coleta. Isso não é uma
          previsão de votação nem garantia de ausência de outros registros.
        </div>{/each}
    </article>
    <aside class="source-panel">
      <p class="eyebrow">RASTREÁVEL, DO INÍCIO AO FIM</p>
      <h2>Direto da fonte.</h2>
      <dl>
        <dt>Casa legislativa</dt>
        <dd>Câmara dos Deputados</dd>
        <dt>Apresentação</dt>
        <dd>{date(p.presentedAt)}</dd>
        <dt>Autoria na fonte</dt>
        <dd>
          {p.authors.map((a: { name: string }) => a.name).join("; ") ||
            "Não informada"}
        </dd>
        <dt>Dados coletados em</dt>
        <dd>
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(data.collectedAt))} (Brasília)
        </dd>
        {#if p.summary}<dt>Resumo gerado em</dt>
          <dd>{date(p.summary.generatedAt)}</dd>
          <dt>Método</dt>
          <dd>{p.summary.method}</dd>{/if}
      </dl>
      <a class="button primary" href={p.url} target="_blank" rel="noreferrer"
        >Acompanhar na Câmara ↗</a
      >{#if p.documentUrl}<a
          class="button secondary"
          href={p.documentUrl}
          target="_blank"
          rel="noreferrer">Ler documento integral ↗</a
        >{/if}<a class="panel-method" href="/sobre/"
        >Como este resumo foi produzido</a
      >
      <details>
        <summary>Identificação da versão</summary>
        <p class="hash">SHA-256 da ementa e do ID:<br />{p.sourceHash}</p>
      </details>
      <a class="panel-method" href="/transparencia/"
        >Conferir as transformações e os arquivos da coleta →</a
      >
    </aside>
  </div>
</main>
