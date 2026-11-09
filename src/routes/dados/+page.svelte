<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import { onMount } from "svelte";
  import { page as urlPage } from "$app/state";
  import type { LegislativeDataset } from "#lib/legislative.ts";
  import { normalize } from "#lib/format.ts";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const profiles = $derived(new Set(data.profileIds));
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
  // Shape check only: the pipeline validates the full schema when it writes the file.
  const isDataset = (value: unknown): value is LegislativeDataset => {
    const data = value as Partial<LegislativeDataset> | null;
    return (
      data?.schemaVersion === 1 &&
      Array.isArray(data.propositions) &&
      Array.isArray(data.votings)
    );
  };

  async function loadData() {
    if (loading || dataset) return;
    loading = true;
    error = "";
    try {
      const response = await fetch(asset("legislativo.json"));
      if (!response.ok)
        throw new Error("Não foi possível baixar a coleta legislativa.");
      const value: unknown = await response.json();
      if (!isDataset(value))
        throw new Error(
          "A coleta recebida tem um formato inválido ou incompatível.",
        );
      dataset = value;
      // Links such as /dados/?proposicao=<id> preselect that proposition; unknown ids are ignored.
      const linked = value.propositions.find(
        (p) => String(p.id) === urlPage.url.searchParams.get("proposicao"),
      );
      if (linked) {
        propositionId = String(linked.id);
      }
    } catch {
      error =
        "Não foi possível carregar uma coleta válida. Verifique a conexão.";
    } finally {
      loading = false;
    }
  }

  // The collection is ~14 KB gzip, so load it right away instead of asking first.
  onMount(loadData);

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
  const votingsWithBallots = $derived(
    dataset?.votings.filter((v) => v.ballots.length > 0).length ?? 0,
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
  // The disclosure's summary names the active filter, so the reader sees it while the list is first.
  const activeFilter = $derived.by(() => {
    if (propositionId) {
      const proposition = dataset?.propositions.find(
        (p) => String(p.id) === propositionId,
      );
      return proposition && `Filtro: ${proposition.label}`;
    }
    if (votingId) {
      const voting = dataset?.votings.find((v) => v.id === votingId);
      return voting && `Filtro: ${dateLabel(voting.date)} · ${voting.organ}`;
    }
    return null;
  });
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
  const firstShown = $derived(
    filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0,
  );
  const lastShown = $derived(
    Math.min(currentPage * pageSize, filteredRows.length),
  );
  // One group per voting, in page order; each shows the split of all its ballots.
  const groups = $derived.by(() => {
    const byVoting = new Map<
      string,
      { voting: Voting; rows: typeof visibleRows; shares: [string, number][] }
    >();
    for (const row of visibleRows) {
      let group = byVoting.get(row.voting.id);
      if (!group) {
        const counts = new Map<string, number>();
        for (const { vote } of row.voting.ballots)
          counts.set(vote, (counts.get(vote) ?? 0) + 1);
        group = {
          voting: row.voting,
          rows: [],
          shares: [...counts].sort((a, b) => b[1] - a[1]),
        };
        byVoting.set(row.voting.id, group);
      }
      group.rows.push(row);
    }
    return [...byVoting.values()];
  });
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
  // Tone only colours the dot; the position text is shown as the source gives it.
  function voteTone(vote: string) {
    return vote === "Sim" ? "yes" : vote === "Não" ? "no" : "neutral";
  }
  function dateLabel(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        }).format(date);
  }
</script>

<svelte:head>
  <title>Como cada deputado votou — Vigia do Povo</title>
  <meta
    name="description"
    content="Veja como cada deputado votou nas votações da Câmara dos Deputados, com fontes oficiais."
  />
</svelte:head>

<main id="conteudo" class="wrap page data-page">
  <h1>Como cada deputado votou</h1>

  {#if !dataset}
    <section
      class="load-panel"
      aria-busy={loading}
      aria-label="Carregar coleta"
    >
      <p role="status">
        {loading || !error ? "Carregando dados da Câmara…" : ""}
      </p>
      <noscript
        ><p>
          Este explorador precisa de JavaScript. Você pode
          <a href={asset("legislativo.json")} download
            >baixar os dados em JSON</a
          >.
        </p></noscript
      >
      {#if error}<p role="alert">{error}</p>
        <button class="button primary" onclick={loadData}
          >Tentar novamente</button
        >{/if}
    </section>
  {:else}
    <div class="coverage">
      <p class="hint">
        {votingsWithBallots} de {dataset.votings.length} votações
        {votingsWithBallots === 1 ? "tem" : "têm"} voto por deputado.
      </p>
      {#if noRecords}<p class="caveat">
          Sem registro não é ausência nem abstenção.
        </p>{/if}
    </div>

    <div class="filter-bar">
      <label class="search-field">
        <span class="sr-only">Deputado: nome ou ID</span>
        <input
          type="search"
          bind:value={deputySearch}
          oninput={() => (page = 1)}
          placeholder="Buscar deputado por nome ou ID"
        />
      </label>
      <div class="filter-row">
        <select
          class="select"
          aria-label="Partido"
          bind:value={party}
          onchange={() => (page = 1)}
        >
          <option value="">Partido</option>
          {#each parties as p}<option value={p}
              >{p === missing ? "Não informado" : p}</option
            >{/each}
        </select>
        <select
          class="select"
          aria-label="UF"
          bind:value={uf}
          onchange={() => (page = 1)}
        >
          <option value="">UF</option>
          {#each states as s}<option value={s}
              >{s === missing ? "Não informada" : s}</option
            >{/each}
        </select>
        <select
          class="select"
          aria-label="Posição"
          bind:value={position}
          onchange={() => (page = 1)}
        >
          <option value={null}>Posição</option>
          {#each positions as p}<option value={p}
              >{p || "Posição não informada"}</option
            >{/each}
        </select>
      </div>
      <details class="disclosure">
        <summary>{activeFilter ?? "Filtrar por proposição ou votação"}</summary>
        <div class="more-filters">
          <select
            class="select"
            aria-label="Tema oficial"
            bind:value={topic}
            onchange={resetSelection}
          >
            <option value="">Todos os temas</option>
            {#each topics as t}<option value={t.id}
                >{t.name} ({t.count}) · {t.id}</option
              >{/each}
            <option value={missing}>Sem classificação ({unclassified})</option>
          </select>
          <label class="search-field">
            <span class="sr-only">Buscar proposição</span>
            <input
              type="search"
              bind:value={proposalSearch}
              oninput={resetSelection}
              placeholder="Título, identificador ou ementa"
            />
          </label>
          <select
            class="select"
            aria-label="Proposição"
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
          <select
            class="select"
            aria-label="Votação"
            bind:value={votingId}
            onchange={resetBallots}
          >
            <option value="">Todas as vinculadas ({votings.length})</option>
            {#each votings as v}<option value={v.id}
                >{dateLabel(v.date)} · {v.organ} · {v.description ||
                  v.id}</option
              >{/each}
          </select>
          {#if !propositions.length}<p class="empty-state" role="status">
              Nenhuma proposição encontrada. Ajuste o tema ou a busca.
            </p>{/if}
        </div>
      </details>
    </div>

    <p class="hint result" role="status">
      {#if filteredRows.length}Mostrando {firstShown}–{lastShown} de {filteredRows.length}{:else}Nenhum
        voto{/if}
    </p>

    {#if visibleRows.length}
      {#each groups as group (group.voting.id)}
        <section
          class="voting"
          aria-label={group.voting.description || group.voting.id}
        >
          <div class="voting-head">
            <p class="voting-title clamp-2">
              {group.voting.description || group.voting.id}
            </p>
            <p class="row-meta">
              {dateLabel(group.voting.date)} · {group.voting.organ} ·
              <a href={group.voting.url}>Registro oficial ↗</a>
            </p>
            <div class="split" aria-hidden="true">
              {#each group.shares as [vote, count]}<span
                  data-tone={voteTone(vote)}
                  style="--n: {count}"
                ></span>{/each}
            </div>
            <ul class="split-legend">
              {#each group.shares as [vote, count]}
                <li data-tone={voteTone(vote)}>
                  <span class="dot"></span><strong>{count}</strong>
                  {vote || "Não informada"}
                </li>
              {/each}
            </ul>
          </div>
          <ul class="rows">
            {#each group.rows as { ballot }}
              {@const linked = profiles.has(ballot.deputyId)}
              <li class="row" class:tap={linked}>
                <div class="row-main">
                  {#if linked}
                    <a
                      class="row-title clamp-1"
                      href={resolve(`deputados/${ballot.deputyId}/`)}
                      >{ballot.name}</a
                    >
                  {:else}
                    <p class="row-title clamp-1">{ballot.name}</p>
                  {/if}
                  <p class="row-meta">
                    {ballot.party ?? "—"} · {ballot.state ?? "—"}
                  </p>
                </div>
                <span class="row-trail" data-tone={voteTone(ballot.vote)}
                  ><span class="dot"></span>
                  {ballot.vote || "Não informada"}</span
                >
                {#if linked}<span class="chev" aria-hidden="true"></span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {:else}
      <p class="empty-state" role="status">
        {#if !votings.length}
          Nenhuma votação vinculada às proposições selecionadas nesta coleta.
        {:else if !rows.length}
          Não há registros individuais disponíveis para esta seleção.
        {:else}
          Nenhum registro corresponde aos filtros.
        {/if}
      </p>
    {/if}

    <nav class="pagination" aria-label="Paginação dos votos">
      <button
        class="button secondary"
        disabled={currentPage <= 1}
        onclick={() => (page = currentPage - 1)}>Anterior</button
      >
      <span>Página {currentPage} de {pageCount}</span>
      <button
        class="button secondary"
        disabled={currentPage >= pageCount}
        onclick={() => (page = currentPage + 1)}>Próxima</button
      >
    </nav>

    <div class="accordion">
      <details class="disclosure">
        <summary>Como interpretar um voto</summary>
        <p class="prose">
          <strong>Registro vazio não significa ausência nem abstenção.</strong>
          Nem toda votação tem registros individuais disponíveis. Votações procedimentais
          não representam necessariamente uma decisão sobre o mérito da proposta.
          Confira a descrição e a fonte oficial antes de interpretar um voto.
        </p>
      </details>
      <details class="disclosure">
        <summary>Cobertura e download</summary>
        <p class="prose">
          Coleta de
          <time datetime={dataset.collectedAt}
            >{dateLabel(dataset.collectedAt)}</time
          >
          (UTC). {dataset.coverage}
        </p>
        <a class="button secondary" href={asset("legislativo.json")} download
          >Baixar conjunto normalizado (JSON)</a
        >
      </details>
      <details class="disclosure">
        <summary>
          Proposições e fontes dos temas ({selectedPropositions.length})
        </summary>
        <ul class="sources">
          {#each selectedPropositions as p}
            <li>
              <a href={resolve(`proposta/${p.id}/`)}>{p.label} — página local</a
              >
              ·
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
      <details class="disclosure">
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
              <p>
                {v.ballotCoverage === "no-individual-records"
                  ? "Sem registros individuais disponíveis"
                  : `${v.ballots.length} registros individuais na coleta`}
              </p>
            </li>
          {/each}
        </ul>
      </details>
    </div>
  {/if}
</main>

<style>
  .load-panel {
    padding: 18px;
    background: var(--surface-alt);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    line-height: 1.6;
  }
  .load-panel p:last-child {
    margin-bottom: 0;
  }
  .more-filters {
    display: grid;
    gap: 8px;
    padding-top: 8px;
  }
  .coverage {
    display: grid;
    gap: 6px;
    margin-block: 8px 12px;
  }
  .result {
    margin-block: 12px 4px;
  }
  .voting + .voting {
    margin-top: 20px;
  }
  .voting-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--green);
  }
  .voting-head {
    display: grid;
    gap: 6px;
  }
  .voting-head + .rows {
    margin-top: 8px;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-block: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }
  .pagination .button {
    min-height: 44px;
    padding-inline: 14px;
  }
  .accordion {
    margin-top: 24px;
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
  button:disabled {
    opacity: 0.5;
  }
</style>
