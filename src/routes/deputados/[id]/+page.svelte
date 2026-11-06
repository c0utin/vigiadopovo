<script lang="ts">
  import { asset, resolve } from "$app/paths";
  import type { PageData } from "./$types";
  import Radar from "#lib/Radar.svelte";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";

  let { data }: { data: PageData } = $props();
  const d = $derived(data.deputy);
  const number = (value: number) => value.toLocaleString("pt-BR");
  const axes = $derived(
    data.activity.map((a) => ({
      label: a.short,
      value: d.percentiles[a.key],
      detail: number(d.counts[a.key]),
    })),
  );
  const facts = $derived(
    [
      ["Situação", d.status],
      ["Condição eleitoral", d.condition],
      ["Desde", d.statusSince ? date(d.statusSince) : null],
      ["Nome civil", d.civilName],
      ["Naturalidade", d.birthplace],
      ["Escolaridade", d.schooling],
    ].filter((fact): fact is [string, string] => Boolean(fact[1])),
  );
  // A deputados.json collected before bills existed has neither field: the
  // profile then renders without the section instead of failing.
  const bills = $derived(
    data.bills && d.bills
      ? data.bills.outcomes.map((o) => ({
          ...o,
          bills: d.bills.filter((b) => b.outcome === o.key),
        }))
      : null,
  );
</script>

<svelte:head
  ><title>{d.name} ({d.party ?? "sem partido"}-{d.state}) — Vigia do Povo</title
  ><meta
    name="description"
    content={`Perfil de ${d.name}, deputado federal (${d.party ?? "sem partido"}-${d.state}): situação, comissões, votos registrados e atividade em ${data.year}, com dados oficiais da Câmara.`}
  /></svelte:head
>

<main id="conteudo" class="wrap detail-page">
  <a class="back-link" href={resolve("deputados/")}>← Deputados</a>
  <header class="profile-head">
    {#if d.photo}<figure>
        <img
          src={asset(d.photo.slice(1) as Parameters<typeof asset>[0])}
          alt={`Foto oficial de ${d.name}`}
          width="177"
          height="236"
        />
        <figcaption>Foto: Câmara dos Deputados</figcaption>
      </figure>{/if}
    <div>
      <p class="eyebrow">Deputado federal · {data.year}</p>
      <h1>{d.name}</h1>
      <p class="party">
        <strong>{d.party ?? "Sem partido"}</strong> · {d.state ?? "—"}
      </p>
      <p class="tags">
        {#if d.status}<span>{d.status}</span>{/if}{#if d.condition}<span
            >{d.condition}</span
          >{/if}
      </p>
      <a
        class="button secondary"
        href={d.profileUrl}
        target="_blank"
        rel="noreferrer">Perfil oficial na Câmara ↗</a
      >
    </div>
  </header>

  <div class="profile-grid">
    <section aria-labelledby="atividade-titulo">
      <h2 id="atividade-titulo">Atividade em {data.year}</h2>
      <Radar
        {axes}
        label={`Gráfico radar da atividade de ${d.name} em ${data.year}, em percentis entre ${data.total} deputados: ${axes.map((a) => `${a.label} ${a.detail}, percentil ${a.value}`).join("; ")}.`}
      />
      <p class="muted">
        Cada eixo mostra a posição entre os {data.total} deputados em exercício: quanto
        mais longe do centro, maior o volume registrado em relação aos demais. A linha
        tracejada é a mediana. O gráfico mede quantidade de registros oficiais, não
        qualidade, mérito ou posição política. Quem assumiu durante o ano teve menos
        tempo para acumular registros.
      </p>
      <table>
        <caption class="sr-only"
          >Indicadores de atividade em {data.year}</caption
        >
        <thead
          ><tr
            ><th scope="col">Indicador</th><th scope="col">Total</th><th
              scope="col">Percentil</th
            ></tr
          ></thead
        >
        <tbody>
          {#each data.activity as a}<tr>
              <th scope="row"
                >{a.label}<span class="muted">{a.description}</span></th
              >
              <td>{number(d.counts[a.key])}</td>
              <td>{d.percentiles[a.key]}</td>
            </tr>{/each}
        </tbody>
      </table>
      <p class="muted">
        Em {data.year}, houve {number(data.nominalVotings.plenary)} votações nominais
        no Plenário e {number(data.nominalVotings.committee)} em outros órgãos com
        registro individual.
      </p>
    </section>

    <aside class="source-panel" aria-labelledby="dados-titulo">
      <h2 id="dados-titulo">Dados oficiais</h2>
      <dl>
        {#each facts as [term, value]}<dt>{term}</dt>
          <dd>{value}</dd>{/each}
      </dl>
      {#if d.parties.length > 1}<h3>Partidos nos votos de {data.year}</h3>
        <ol class="parties">
          {#each d.parties as p}<li>
              <strong>{p.party}</strong>
              {p.from ? date(p.from) : "?"} a {p.until ? date(p.until) : "?"}
            </li>{/each}
        </ol>{/if}
      <AskAI href={resolve(`deputados/${d.id}.md`)} what="este deputado" />
    </aside>
  </div>

  <section aria-labelledby="orgaos-titulo">
    <h2 id="orgaos-titulo">
      Comissões e órgãos <span class="muted">({d.organs.length})</span>
    </h2>
    {#if d.organs.length}<ul class="organs">
        {#each d.organs as o}<li>
            <strong>{o.name}</strong>
            <span>{o.role}{o.since ? ` · desde ${date(o.since)}` : ""}</span>
          </li>{/each}
      </ul>{:else}<p class="muted">
        Nenhuma participação vigente nos registros oficiais da legislatura.
      </p>{/if}
  </section>

  {#if data.bills && bills}<section aria-labelledby="projetos-titulo">
      <h2 id="projetos-titulo">
        Projetos apresentados <span class="muted"
          >({number(d.bills.length)})</span
        >
      </h2>
      <p class="muted">
        {data.bills.types.join(", ")} apresentados desde {date(
          data.bills.since,
        )}, início da legislatura, como autor ou coautor. A situação é a última
        registrada pela Câmara. Um projeto tramitando em conjunto segue o
        destino do projeto ao qual foi anexado.
      </p>
      {#if d.bills.length}<ul class="outcomes">
          {#each bills as g}<li class={g.key}>
              <svelte:element
                this={g.bills.length ? "a" : "span"}
                href={g.bills.length ? `#projetos-${g.key}` : undefined}
                ><strong>{number(g.bills.length)}</strong
                >{g.label}</svelte:element
              >
            </li>{/each}
        </ul>
        {#each bills as g}{#if g.bills.length}<details
              id={`projetos-${g.key}`}
              class="bill-group {g.key}"
              open={g.bills.length <= 10}
            >
              <summary
                >{g.label}
                <span class="muted">({number(g.bills.length)})</span></summary
              >
              <p class="muted">{g.description}</p>
              <ol class="vote-list">
                {#each g.bills as b}<li>
                    <p class="vote-date">
                      <strong>{b.label}</strong> · apresentado em {date(
                        b.presentedAt,
                      )}{b.firstAuthor ? "" : " · coautoria"}
                    </p>
                    <p>{b.ementa}</p>
                    <p class="muted">
                      {b.situation ?? "Situação não informada"}{b.statusAt
                        ? ` · ${date(b.statusAt)}`
                        : ""}
                    </p>
                    <a
                      href={`https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${b.id}`}
                      target="_blank"
                      rel="noreferrer">Tramitação oficial ↗</a
                    >
                  </li>{/each}
              </ol>
            </details>{/if}{/each}{:else}<p class="muted">
          Nenhum projeto apresentado como autor ou coautor nesta legislatura.
        </p>{/if}
    </section>{/if}

  <section aria-labelledby="votos-titulo">
    <h2 id="votos-titulo">Últimos votos no Plenário</h2>
    {#if d.recentVotes.length}<p class="muted">
        Votações nominais com registro individual. Votações simbólicas não
        identificam o voto de cada deputado. Aprovar um requerimento ou uma
        etapa não significa aprovar uma lei.
      </p>
      <ol class="vote-list">
        {#each d.recentVotes as v}<li>
            <p class="vote-date">
              {date(v.date)}{#if v.propositions.length}
                · {v.propositions.map((p) => p.label).join(", ")}{/if}
            </p>
            <p>
              <span class="vote">{v.vote || "Tipo de voto não informado"}</span>
            </p>
            <p>{v.description}</p>
            <a href={v.url} target="_blank" rel="noreferrer"
              >Registro oficial ↗</a
            >
          </li>{/each}
      </ol>{:else}<p class="muted">
        Nenhum voto nominal no Plenário registrado em {data.year}.
      </p>{/if}
  </section>

  <details>
    <summary>Sobre estes dados</summary>
    <p>
      Coletados em {date(data.collectedAt)} da API e dos arquivos de dados abertos
      da Câmara. Partido e estado são os do cadastro atual; nos votos, valem os registrados
      junto a cada voto. Não publicamos CPF, data de nascimento nem contatos.
    </p>
    <ul class="sources">
      {#each data.sources as s}<li>
          <a href={s.url}>{s.url.split("/").at(-1)}</a>
          <span class="hash">SHA-256 {s.sha256}</span>
        </li>{/each}
      <li><a href={d.apiUrl}>Cadastro na API ↗</a></li>
    </ul>
    <p>
      <a href={resolve("transparencia/")}>Transparência dos dados</a> ·
      <a href={asset("deputados.json" as Parameters<typeof asset>[0])} download
        >Baixar todos os perfis ↗</a
      >
    </p>
  </details>
</main>

<style>
  .profile-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  figure {
    margin: 0;
  }
  img {
    display: block;
    width: 112px;
    height: auto;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 12px;
    background: #e5e8d9;
  }
  figcaption {
    margin-top: 6px;
    font-size: 11px;
    color: var(--muted);
  }
  h1 {
    font-size: 32px;
    letter-spacing: -1px;
    line-height: 1.15;
    margin: 4px 0 6px;
  }
  .party {
    margin: 0 0 10px;
    font-size: 17px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 14px;
  }
  .tags span,
  .vote {
    font-size: 13px;
    padding: 3px 10px;
    border-radius: 12px;
    background: #eaf0df;
    color: var(--green);
    font-weight: 600;
  }
  .profile-head .button {
    min-height: 44px;
  }
  h2 {
    font-size: 26px;
    margin: 32px 0 14px;
  }
  .profile-grid {
    display: grid;
    gap: 24px;
  }
  .profile-grid .source-panel {
    /* The shared panel style places itself in the proposal page's grid. */
    grid-area: auto;
    margin-top: 32px;
  }
  .profile-grid .source-panel h2 {
    margin-top: 0;
    font-size: 22px;
  }
  h3 {
    font-size: 16px;
    margin: 20px 0 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-block: 16px;
    font-size: 15px;
  }
  th,
  td {
    text-align: left;
    padding: 10px 6px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  thead th {
    white-space: nowrap;
    font-size: 13px;
    color: var(--muted);
  }
  td {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  tbody th span {
    display: block;
    font-weight: 400;
    font-size: 12px;
    line-height: 1.5;
  }
  .parties,
  .organs,
  .sources {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .parties li {
    font-size: 14px;
    padding-block: 4px;
  }
  .organs {
    display: grid;
    gap: 8px;
  }
  .organs li {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .organs span {
    font-size: 14px;
    color: var(--muted);
  }
  .sources li {
    display: grid;
    padding-block: 6px;
  }
  .sources a {
    min-height: 32px;
  }
  .sources .hash {
    font-size: 11px;
  }
  details {
    margin-top: 32px;
    border-top: 1px solid var(--line);
  }
  .outcomes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin: 16px 0 8px;
    padding: 0;
    list-style: none;
  }
  .outcomes > li > * {
    display: grid;
    gap: 2px;
    min-height: 44px;
    padding: 10px 14px;
    background: #fff;
    border: 1px solid var(--line);
    border-left: 6px solid var(--tone);
    border-radius: 10px;
    font-size: 14px;
    text-decoration: none;
  }
  .outcomes strong {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  .law {
    --tone: #2f7d3a;
  }
  .approved {
    --tone: #9cc95a;
  }
  .rejected {
    --tone: #b8432f;
  }
  .active {
    --tone: #d9b54a;
  }
  .closed {
    --tone: #a3aaa0;
  }
  /* After the shared details rule, which styles "Sobre estes dados". */
  .bill-group {
    margin-top: 0;
    border-top: 0;
    border-bottom: 1px solid var(--line);
  }
  .bill-group li:last-child {
    border-bottom: 0;
  }
  .bill-group summary {
    font-size: 17px;
    font-weight: 700;
  }
  .bill-group summary::before {
    content: "";
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-inline: 4px 8px;
    border-radius: 50%;
    background: var(--tone);
  }
  @media (min-width: 600px) {
    img {
      width: 160px;
    }
    h1 {
      font-size: 42px;
    }
    .organs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 900px) {
    .profile-grid {
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 48px;
    }
  }
</style>
