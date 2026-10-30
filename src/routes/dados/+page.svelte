<script lang="ts">
  import type { LegislativeDataset } from "#lib/legislative.ts";

  type Voting = LegislativeDataset["votings"][number];
  let dataset = $state.raw<LegislativeDataset | null>(null);
  let loading = $state(false);
  let error = $state("");
  let topic = $state("");
  let proposalSearch = $state("");
  let propositionId = $state("");
  let votingId = $state("");
  let deputySearch = $state("");
  let party = $state("");
  let uf = $state("");
  let position = $state<string | null>(null);
  let page = $state(1);
  const pageSize = 20;
  const missing = "__missing__";
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
  const nullableString = (value: unknown) =>
    value === null || typeof value === "string";

  function isDataset(value: unknown): value is LegislativeDataset {
    if (
      !record(value) ||
      value.schemaVersion !== 1 ||
      typeof value.collectedAt !== "string" ||
      typeof value.coverage !== "string" ||
      !Array.isArray(value.propositions) ||
      !Array.isArray(value.votings)
    )
      return false;
    return (
      value.propositions.every(
        (p: unknown) =>
          record(p) &&
          typeof p.id === "number" &&
          typeof p.label === "string" &&
          typeof p.ementa === "string" &&
          typeof p.url === "string" &&
          Array.isArray(p.votingIds) &&
          p.votingIds.every((id: unknown) => typeof id === "string") &&
          Array.isArray(p.labels) &&
          p.labels.every(
            (label: unknown) =>
              record(label) &&
              typeof label.id === "string" &&
              typeof label.name === "string" &&
              typeof label.sourceUrl === "string" &&
              typeof label.relevance === "number",
          ),
      ) &&
      value.votings.every(
        (v: unknown) =>
          record(v) &&
          typeof v.id === "string" &&
          typeof v.date === "string" &&
          typeof v.description === "string" &&
          typeof v.organ === "string" &&
          typeof v.url === "string" &&
          typeof v.ballotsUrl === "string" &&
          Array.isArray(v.propositionIds) &&
          v.propositionIds.every((id: unknown) => typeof id === "number") &&
          (v.ballotCoverage === "recorded-votes" ||
            v.ballotCoverage === "no-individual-records") &&
          Array.isArray(v.ballots) &&
          v.ballots.every(
            (b: unknown) =>
              record(b) &&
              typeof b.deputyId === "number" &&
              typeof b.name === "string" &&
              nullableString(b.party) &&
              nullableString(b.state) &&
              typeof b.vote === "string" &&
              nullableString(b.registeredAt),
          ),
      )
    );
  }

  async function loadData() {
    if (loading || dataset) return;
    loading = true;
    error = "";
    try {
      const response = await fetch("/legislativo.json");
      if (!response.ok)
        throw new Error("Não foi possível baixar a coleta legislativa.");
      const value: unknown = await response.json();
      if (!isDataset(value))
        throw new Error(
          "A coleta recebida tem um formato inválido ou incompatível.",
        );
      dataset = value;
    } catch {
      error =
        "Não foi possível carregar uma coleta válida. Verifique a conexão.";
    } finally {
      loading = false;
    }
  }

  const topics = $derived.by(() => {
    const counts = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const p of dataset?.propositions ?? []) {
      for (const label of new Map(
        p.labels.map((label) => [label.id, label]),
      ).values()) {
        const entry = counts.get(label.id) ?? {
          id: label.id,
          name: label.name,
          count: 0,
        };
        entry.count++;
        counts.set(label.id, entry);
      }
    }
    return [...counts.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  });
  const unclassified = $derived(
    dataset?.propositions.filter((p) => p.labels.length === 0).length ?? 0,
  );
  const propositions = $derived(
    (dataset?.propositions ?? []).filter(
      (p) =>
        (!topic ||
          (topic === missing
            ? p.labels.length === 0
            : p.labels.some((label) => label.id === topic))) &&
        normalize(`${p.label} ${p.id} ${p.ementa}`).includes(
          normalize(proposalSearch.trim()),
        ),
    ),
  );
  const selectedPropositions = $derived(
    propositions.filter(
      (p) => !propositionId || String(p.id) === propositionId,
    ),
  );
  const votings = $derived.by(() => {
    const ids = new Set(selectedPropositions.flatMap((p) => p.votingIds));
    const proposalIds = new Set(selectedPropositions.map((p) => p.id));
    const unique = new Map<string, Voting>();
    for (const voting of dataset?.votings ?? []) {
      if (
        ids.has(voting.id) ||
        voting.propositionIds.some((id) => proposalIds.has(id))
      )
        unique.set(voting.id, voting);
    }
    return [...unique.values()];
  });
  const selectedVotings = $derived(
    votings.filter((v) => !votingId || v.id === votingId),
  );
  const rows = $derived(
    selectedVotings.flatMap((voting) =>
      voting.ballots.map((ballot) => ({
        voting,
        ballot,
        searchText: normalize(`${ballot.name} ${ballot.deputyId}`),
      })),
    ),
  );
  const deputyQuery = $derived(normalize(deputySearch.trim()));
  function options(field: "party" | "state" | "vote") {
    return [
      ...new Set(rows.map(({ ballot }) => ballot[field] ?? missing)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  const parties = $derived(options("party"));
  const states = $derived(options("state"));
  const positions = $derived(options("vote"));
  const filteredRows = $derived(
    rows.filter(
      ({ ballot, searchText }) =>
        searchText.includes(deputyQuery) &&
        (!party || (ballot.party ?? missing) === party) &&
        (!uf || (ballot.state ?? missing) === uf) &&
        (position === null || ballot.vote === position),
    ),
  );
  const pageCount = $derived(
    Math.max(1, Math.ceil(filteredRows.length / pageSize)),
  );
  const currentPage = $derived(Math.min(page, pageCount));
  const visibleRows = $derived(
    filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  );
  const noRecords = $derived(
    selectedVotings.filter(
      (v) =>
        v.ballotCoverage === "no-individual-records" || v.ballots.length === 0,
    ).length,
  );
  function resetSelection() {
    propositionId = "";
    votingId = "";
    resetBallots();
  }
  function resetBallots() {
    party = "";
    uf = "";
    position = null;
    page = 1;
  }
  function dateLabel(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(date);
  }
</script>

<svelte:head>
  <title>Dados legislativos — Vigia do Povo</title>
  <meta
    name="description"
    content="Explore temas oficiais, proposições e registros individuais de votações da Câmara dos Deputados."
  />
</svelte:head>

<main id="conteudo" class="wrap data-page">
  <p class="eyebrow">
    <span class="tiny-line"></span> DADOS ABERTOS · CÂMARA DOS DEPUTADOS
  </p>
  <h1>Explore os <em>dados.</em></h1>
  <p class="intro">
    Explore propostas e votos da Câmara. Baixe a coleta para começar; suas
    buscas e filtros não são salvos.
  </p>
  <details class="notice">
    <summary>Como interpretar um voto</summary>
    <p>
      <strong>Registro vazio não significa ausência nem abstenção.</strong>
      Nem toda votação tem registros individuais disponíveis. Votações procedimentais
      não representam necessariamente uma decisão sobre o mérito da proposta. Confira
      a descrição e a fonte oficial antes de interpretar um voto.
    </p>
  </details>

  {#if !dataset}
    <section
      class="load-panel"
      aria-busy={loading}
      aria-label="Carregar coleta"
    >
      <h2>Comece pela fonte.</h2>
      <p>Esta coleta é uma amostra, não todo o histórico legislativo.</p>
      <button class="button primary" onclick={loadData} disabled={loading}
        >{loading ? "Carregando dados…" : "Carregar dados legislativos"}</button
      >
      <p role="status">
        {loading ? "Baixando e validando a coleta legislativa…" : ""}
      </p>
      {#if error}<p role="alert">
          {error} Tente novamente pelo botão acima.
        </p>{/if}
    </section>
  {:else}
    <section class="collection" aria-label="Sobre a coleta">
      <p>
        <strong>Coleta:</strong>
        <time datetime={dataset.collectedAt}
          >{dateLabel(dataset.collectedAt)}</time
        > (UTC)
      </p>
      <p>
        {dataset.propositions.length} proposições · {dataset.votings.length} votações
        · {dataset.votings.reduce((sum, v) => sum + v.ballots.length, 0)} registros
        individuais
      </p>
      <details>
        <summary>Cobertura e download</summary>
        <p>{dataset.coverage}</p>
        <a class="button secondary" href="/legislativo.json" download
          >Baixar conjunto normalizado (JSON)</a
        >
      </details>
    </section>
    <nav class="query-steps" aria-label="Etapas da consulta">
      <a href="#proposals-title">1. Propostas</a>
      <a href="#votings-title">2. Votações</a>
      <a href="#ballots-title">3. Votos</a>
    </nav>

    <section aria-labelledby="proposals-title">
      <h2 id="proposals-title">1. Temas e proposições</h2>
      <p class="help">
        Agrupamentos por rótulos oficiais da Câmara, sem inferência por IA. Uma
        proposição pode pertencer a vários temas; as contagens não são
        exclusivas. “Sem classificação” significa nenhum rótulo oficial nesta
        coleta.
      </p>
      <div class="filters">
        <label
          >Tema oficial
          <select bind:value={topic} onchange={resetSelection}>
            <option value=""
              >Todos os temas ({dataset.propositions.length})</option
            >
            {#each topics as t}<option value={t.id}
                >{t.name} ({t.count}) · {t.id}</option
              >{/each}
            <option value={missing}>Sem classificação ({unclassified})</option>
          </select>
        </label>
        <label
          >Buscar proposição
          <input
            type="search"
            bind:value={proposalSearch}
            oninput={resetSelection}
            placeholder="Identificador, título ou ementa"
          />
        </label>
        <label
          >Proposição
          <select
            bind:value={propositionId}
            onchange={() => {
              votingId = "";
              resetBallots();
            }}
          >
            <option value=""
              >Todas as encontradas ({propositions.length})</option
            >
            {#each propositions as p}<option value={String(p.id)}
                >{p.label} · {p.id}</option
              >{/each}
          </select>
        </label>
      </div>
      {#if !propositions.length}<p class="empty-message" role="status">
          Nenhuma proposição encontrada. Ajuste o tema ou a busca.
        </p>{/if}
      <details>
        <summary
          >Ver proposições e fontes dos temas ({selectedPropositions.length})</summary
        >
        <ul class="sources">
          {#each selectedPropositions as p}
            <li>
              <a href={`/proposta/${p.id}/`}>{p.label} — página local</a> ·
              <a href={p.url}>Proposição na Câmara</a>
              <p>{p.ementa}</p>
              {#each p.labels as label}<a
                  class="label-link"
                  href={label.sourceUrl}>{label.name} ({label.id})</a
                >{:else}<span>Sem classificação oficial</span>{/each}
            </li>
          {/each}
        </ul>
      </details>
    </section>

    <section aria-labelledby="votings-title">
      <h2 id="votings-title">2. Votações</h2>
      <label
        >Votação
        <select bind:value={votingId} onchange={resetBallots}>
          <option value="">Todas as vinculadas ({votings.length})</option>
          {#each votings as v}<option value={v.id}
              >{dateLabel(v.date)} · {v.organ} · {v.description || v.id}</option
            >{/each}
        </select>
      </label>
      <p class="help">
        {selectedVotings.length} votações selecionadas. Uma votação vinculada a várias
        proposições é contada apenas uma vez.
      </p>
      {#if !votings.length}<p class="empty-message">
          Nenhuma votação vinculada às proposições selecionadas nesta coleta.
        </p>{/if}
      {#if noRecords}<p class="notice">
          {noRecords} votação(ões) selecionada(s) sem registros individuais disponíveis.
          Isso não indica ausência ou abstenção de deputados.
        </p>{/if}
      <details>
        <summary
          >Descrições e fontes oficiais ({selectedVotings.length})</summary
        >
        <ul class="sources">
          {#each selectedVotings as v}
            <li>
              <strong>{dateLabel(v.date)} · {v.organ} · {v.id}</strong>
              <p>{v.description || "Descrição não informada."}</p>
              <a href={v.url}>Votação na Câmara</a> ·
              <a href={v.ballotsUrl}>Fonte dos votos individuais</a>
              <p class="help">
                {v.ballotCoverage === "no-individual-records"
                  ? "Sem registros individuais disponíveis"
                  : `${v.ballots.length} registros individuais na coleta`}
              </p>
            </li>
          {/each}
        </ul>
      </details>
    </section>

    <section aria-labelledby="ballots-title">
      <h2 id="ballots-title">3. Votos individuais</h2>
      <div class="filters ballot-filters">
        <label
          >Deputado: nome ou ID<input
            type="search"
            bind:value={deputySearch}
            oninput={() => (page = 1)}
            placeholder="Buscar deputado"
          /></label
        >
        <label
          >Partido<select bind:value={party} onchange={() => (page = 1)}
            ><option value="">Todos</option>{#each parties as p}<option
                value={p}>{p === missing ? "Não informado" : p}</option
              >{/each}</select
          ></label
        >
        <label
          >UF<select bind:value={uf} onchange={() => (page = 1)}
            ><option value="">Todas</option>{#each states as s}<option value={s}
                >{s === missing ? "Não informada" : s}</option
              >{/each}</select
          ></label
        >
        <label
          >Posição exata<select
            bind:value={position}
            onchange={() => (page = 1)}
            ><option value={null}>Todas</option>{#each positions as p}<option
                value={p}>{p || "Posição não informada"}</option
              >{/each}</select
          ></label
        >
      </div>
      <p class="help" role="status">
        {filteredRows.length} de {rows.length} registros individuais correspondem
        aos filtros. Exibindo {filteredRows.length
          ? (currentPage - 1) * pageSize + 1
          : 0}–{Math.min(currentPage * pageSize, filteredRows.length)}.
      </p>
      <p id="table-help" class="help">
        Em telas estreitas, cada voto aparece em um cartão. As posições são
        reproduzidas como informadas pela fonte, sem inferir apoio ao mérito.
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll the wide table.) -->
      <div
        class="table-scroll"
        role="region"
        aria-label="Tabela de votos individuais"
        aria-describedby="table-help"
        tabindex="0"
      >
        <table>
          <caption>Registros individuais nas votações selecionadas</caption>
          <thead
            ><tr
              ><th scope="col">Deputado</th><th scope="col">ID</th><th
                scope="col">Partido</th
              ><th scope="col">UF</th><th scope="col">Posição</th><th
                scope="col">Votação / fonte oficial</th
              ><th scope="col">Registro</th></tr
            ></thead
          >
          <tbody>
            {#each visibleRows as { ballot, voting }}
              <tr
                ><th scope="row">{ballot.name}</th><td data-label="ID"
                  >{ballot.deputyId}</td
                ><td data-label="Partido">{ballot.party ?? "Não informado"}</td
                ><td data-label="UF">{ballot.state ?? "Não informada"}</td><td
                  data-label="Posição">{ballot.vote || "Não informada"}</td
                ><td data-label="Votação / fonte oficial"
                  ><a href={voting.url}>{voting.id}</a><br />{dateLabel(
                    voting.date,
                  )} · {voting.organ}<br /><a href={voting.ballotsUrl}
                    >Fonte dos votos</a
                  ></td
                ><td data-label="Registro"
                  >{ballot.registeredAt ?? "Não informado"}</td
                ></tr
              >
            {:else}
              <tr
                ><td colspan="7"
                  >{rows.length
                    ? "Nenhum registro corresponde aos filtros."
                    : "Não há registros individuais disponíveis para esta seleção. Isso não indica ausência nem abstenção."}</td
                ></tr
              >
            {/each}
          </tbody>
        </table>
      </div>
      <nav class="pagination" aria-label="Paginação dos votos">
        <button
          class="button secondary"
          disabled={currentPage <= 1}
          onclick={() => (page = currentPage - 1)}>Anterior</button
        >
        <span
          >Página {currentPage} de {pageCount} · até {pageSize} registros por página</span
        >
        <button
          class="button secondary"
          disabled={currentPage >= pageCount}
          onclick={() => (page = currentPage + 1)}>Próxima</button
        >
      </nav>
    </section>
  {/if}
</main>

<style>
  .data-page {
    padding-block: 24px 40px;
    min-width: 0;
  }
  h1 {
    font-size: clamp(34px, 6vw, 60px);
    letter-spacing: -1.2px;
  }
  .intro {
    max-width: 760px;
    line-height: 1.7;
    font-size: 15px;
    color: var(--muted);
  }
  h2[id] {
    scroll-margin-top: 20px;
  }
  .query-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .query-steps a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    border: 1px solid var(--line);
    border-radius: 8px;
    text-decoration: none;
    font-size: 12px;
    background: #fff;
  }
  .data-page > .notice {
    padding-block: 8px;
  }
  section {
    margin-block: 24px;
    min-width: 0;
  }
  section + section {
    border-top: 1px solid var(--line);
    padding-top: 32px;
  }
  .load-panel,
  .collection {
    background: #f0f1e8;
    padding: 26px;
    border: 1px solid var(--line);
    border-radius: 12px;
    line-height: 1.7;
  }
  .load-panel p:last-child {
    margin-bottom: 0;
  }
  .collection {
    overflow-wrap: anywhere;
  }
  .help {
    font-size: 12px;
    line-height: 1.8;
    color: var(--muted);
    margin-block: 14px;
  }
  .filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
    color: var(--green);
    padding: 10px;
    font-size: 16px;
    font-weight: 400;
  }
  .sources {
    padding-left: 22px;
  }
  .sources li {
    margin-bottom: 22px;
    overflow-wrap: anywhere;
  }
  .sources p {
    margin-block: 9px;
  }
  .label-link {
    display: inline-block;
    margin: 0 14px 6px 0;
  }
  .empty-message {
    padding: 20px;
    background: #edf0e5;
    line-height: 1.8;
  }
  .table-scroll {
    max-width: 100%;
    overflow-x: auto;
  }
  .table-scroll:focus-visible {
    outline: 2px solid #507b29;
    outline-offset: 4px;
  }
  table {
    display: block;
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    line-height: 1.7;
    text-align: left;
  }
  caption {
    display: block;
    text-align: left;
    padding: 16px;
    font-weight: 600;
    background: #edf0e5;
  }
  th,
  td {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  tbody {
    display: block;
  }
  tbody tr {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px;
    margin-block: 12px;
    background: #fff;
  }
  tbody th,
  td[colspan] {
    grid-column: 1 / -1;
  }
  td[data-label="Registro"] {
    grid-column: 1 / -1;
  }
  td[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 3px;
  }
  tbody th {
    font-weight: 600;
  }
  tbody tr:nth-child(even) {
    background: #f4f5ee;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 18px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .ballot-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ballot-filters label:first-child,
  .ballot-filters label:last-child {
    grid-column: 1 / -1;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  @media (min-width: 501px) {
    .filters,
    .ballot-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 761px) {
    .filters {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .ballot-filters {
      grid-template-columns: 2fr 1fr 1fr 1fr;
    }
    .ballot-filters label:first-child,
    .ballot-filters label:last-child {
      grid-column: auto;
    }
    .table-scroll {
      border: 1px solid var(--line);
      border-radius: 5px;
    }
    table {
      display: table;
      font-size: 12px;
    }
    caption {
      display: table-caption;
    }
    thead {
      position: static;
      width: auto;
      height: auto;
      clip-path: none;
      overflow: visible;
      display: table-header-group;
      background: #f0f1e8;
    }
    tbody {
      display: table-row-group;
    }
    thead tr,
    tbody tr {
      display: table-row;
      padding: 0;
      margin: 0;
      border: 0;
    }
    th,
    td {
      display: table-cell;
      padding: 14px;
      vertical-align: top;
      border-bottom: 1px solid var(--line);
    }
    td[data-label]::before {
      display: none;
    }
  }
  @media (max-width: 500px) {
    .filters:not(.ballot-filters) {
      grid-template-columns: minmax(0, 1fr);
    }
    .collection,
    .load-panel {
      padding: 20px;
    }
    .pagination span {
      order: 3;
      width: 100%;
      text-align: center;
    }
  }
</style>
