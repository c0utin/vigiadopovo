<script lang="ts">
  import portal from "#lib/portal.ts";
  import Congress from "#lib/Congress.svelte";
  import { date, normalize } from "#lib/format.ts";

  let query = $state("");
  let topic = $state("Todos os temas");
  let view = $state("Todas");
  let order = $state("recent");
  const topics = [
    "Todos os temas",
    ...new Set(
      portal.propositions
        .map((p) => p.summary?.topic)
        .filter((t): t is string => !!t),
    ),
  ];
  const summarized = portal.propositions.filter((p) => p.summary).length;
  let filtered = $derived(
    portal.propositions
      .filter((p) => {
        const matchesQuery = normalize(
          `${p.label} ${p.ementa} ${p.summary?.title ?? ""} ${p.authors.map((a) => a.name).join(" ")}`,
        ).includes(normalize(query));
        return (
          matchesQuery &&
          (topic === "Todos os temas" || p.summary?.topic === topic) &&
          (view !== "Com votação" || p.votes.length > 0) &&
          (view !== "Com resumo" || !!p.summary)
        );
      })
      .toSorted((a, b) =>
        order === "recent"
          ? b.presentedAt.localeCompare(a.presentedAt)
          : a.presentedAt.localeCompare(b.presentedAt),
      ),
  );

  function clear() {
    query = "";
    topic = "Todos os temas";
    view = "Todas";
  }
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
      <p class="eyebrow">
        <span class="tiny-line"></span> POLÍTICA SEM COMPLICAÇÃO
      </p>
      <h1>É público.<br />É sobre você.<br /><em>É bom entender.</em></h1>
      <p class="hero-description">
        O que está em discussão na Câmara, explicado sem juridiquês. Informação
        da fonte para você formar a sua própria opinião.
      </p>
      <a class="button primary" href="#propostas"
        >Explore as propostas <span aria-hidden="true">↗</span></a
      ><span class="hero-note">Sem cadastro. Sem lado. Com fonte.</span>
    </div>
    <div class="hero-art">
      <div class="art-label">
        <span class="live-dot"></span> DEMOCRACIA SE ACOMPANHA
      </div>
      <Congress />
      <div class="art-caption">
        <span>Congresso Nacional</span><span>Brasília, Brasil · 15°47′ S</span>
      </div>
      <div class="art-note">
        <span aria-hidden="true">↳</span> As decisões de lá.<br /><span
          class="indent">A vida de quem está aqui.</span
        >
      </div>
    </div>
  </section>

  <div class="trust-strip">
    <div class="wrap trust-items">
      <span><span aria-hidden="true">✓</span> Fontes oficiais, sempre</span
      ><span><span aria-hidden="true">≋</span> Linguagem de gente</span><span
        ><span aria-hidden="true">◈</span> Sem vínculo partidário</span
      ><a href="/sobre/"
        >Conheça nosso compromisso <span aria-hidden="true">↗</span></a
      >
    </div>
  </div>

  <section id="propostas" class="feed wrap">
    <div class="section-heading">
      <div>
        <p class="eyebrow">DE OLHO NA CÂMARA</p>
        <h2>O que pode mudar a sua vida<span class="brand-dot">.</span></h2>
        <p>Propostas reais. Explicações simples. A fonte a um clique.</p>
      </div>
      <div class="snapshot">
        <span class="live-dot"></span> Coleta em {date(
          portal.collectedAt,
        )}<small>Uma amostra, não a pauta completa</small>
      </div>
    </div>
    <div class="search-row">
      <label class="search-field"
        ><span aria-hidden="true">⌕</span><span class="sr-only"
          >Buscar propostas</span
        ><input
          type="search"
          bind:value={query}
          placeholder="Busque por assunto, proposta ou autor..."
        /></label
      ><label class="topic-select"
        ><span class="sr-only">Filtrar por tema</span><select bind:value={topic}
          >{#each topics as t}<option>{t}</option>{/each}</select
        ></label
      >
    </div>
    <div class="feed-toolbar">
      <div class="tabs" aria-label="Filtrar propostas">
        {#each ["Todas", "Com votação", "Com resumo"] as tab}<button
            class:active={view === tab}
            aria-pressed={view === tab}
            onclick={() => (view = tab)}
            >{tab}{#if tab === "Todas"}<span class="count"
                >{portal.propositions.length}</span
              >{/if}</button
          >{/each}
      </div>
      <label class="sort"
        >Ordenar por <select aria-label="Ordenar propostas" bind:value={order}
          ><option value="recent">Mais recentes</option><option value="oldest"
            >Mais antigas</option
          ></select
        ></label
      >
    </div>
    <div class="results-info" aria-live="polite">
      {filtered.length}
      {filtered.length === 1
        ? "proposta encontrada"
        : "propostas encontradas"}{#if query || topic !== "Todos os temas" || view !== "Todas"}<button
          class="text-button"
          onclick={clear}>Limpar filtros ×</button
        >{/if}
    </div>
    <div class="proposal-grid">
      {#each filtered as p}
        <article class="proposal-card">
          <div class="card-top">
            <span
              class="topic"
              class:health={p.summary?.topic === "Saúde"}
              class:justice={p.summary?.topic === "Justiça"}
              >{p.summary?.topic ?? "A classificar"}</span
            ><span class="proposal-id">{p.label}</span>
          </div>
          <p class="stage">
            <span></span>{p.votes.length
              ? "Com votação registrada"
              : "Sem votação nesta coleta"}
          </p>
          <h3><a href="/proposta/{p.id}/">{p.summary?.title ?? p.label}</a></h3>
          <p class="card-description">{p.summary?.text ?? p.ementa}</p>
          <div class="card-meta">
            <span>Câmara dos Deputados</span><span>{date(p.presentedAt)}</span>
          </div>
          <div class="card-bottom">
            <a class="read-link" href="/proposta/{p.id}/"
              >Entender a proposta <span aria-hidden="true">↗</span></a
            ><span class="ai-label"
              >{p.summary ? "Resumo por IA" : "Ementa oficial"}</span
            >
          </div>
        </article>
      {:else}<div class="empty-state">
          <span aria-hidden="true">⌕</span>
          <h3>Nenhuma proposta por aqui.</h3>
          <p>
            Tente outro assunto ou remova os filtros para continuar explorando.
          </p>
          <button class="button primary" onclick={clear}
            >Ver todas as propostas ↗</button
          >
        </div>{/each}
    </div>
    <p class="feed-disclaimer">
      <span aria-hidden="true">ⓘ</span> Proposta não é lei. Os resumos explicam a
      ementa e podem conter erros. Confira o texto oficial.
    </p>
  </section>

  <section id="como-funciona" class="method-section">
    <div class="wrap">
      <div class="method-heading">
        <div>
          <p class="eyebrow">DA FONTE AO SEU DIA A DIA</p>
          <h2>Menos ruído.<br /><em>Mais entendimento.</em></h2>
        </div>
        <p>
          Você não precisa ser especialista para acompanhar a política. Mas
          precisa saber de onde vem a informação.
        </p>
      </div>
      <div class="method-grid">
        <div>
          <span class="step">01 / COLETAR</span>
          <h3>A informação vem da fonte.</h3>
          <p>
            Consultamos a API de Dados Abertos da Câmara. Preservamos autoria,
            datas, situação e links originais.
          </p>
        </div>
        <div>
          <span class="step">02 / SIMPLIFICAR</span>
          <h3>O juridiquês fica de fora.</h3>
          <p>
            A IA deste chat explica a ementa em linguagem simples, sem inventar
            impactos nem recomendar como votar.
          </p>
        </div>
        <div>
          <span class="step">03 / CONFERIR</span>
          <h3>Você tem a palavra final.</h3>
          <p>
            Cada resumo mostra a fonte e seus limites. O texto original está
            sempre disponível para conferir.
          </p>
        </div>
      </div>
      <div class="method-bottom">
        <span
          >{summarized} resumos disponíveis nesta coleta · revisão humana pendente</span
        ><a href="/sobre/">Veja as fontes e a metodologia ↗</a>
      </div>
    </div>
  </section>
  <section class="closing wrap">
    <span aria-hidden="true">✳</span>
    <h2>Uma democracia mais clara<br />começa com gente bem informada.</h2>
    <a href="#propostas">Vamos acompanhar? ↗</a>
  </section>
</main>
