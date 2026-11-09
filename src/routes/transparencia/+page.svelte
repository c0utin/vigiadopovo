<script lang="ts">
  import { asset, resolve } from "$app/paths";
  // Provenance stores root-relative URLs; asset() adds the deploy base path.
  const file = (url: string) => url.slice(1) as Parameters<typeof asset>[0];
  import provenance from "#lib/data/provenance.json";
  import { date } from "#lib/format.ts";
  import AskAI from "#lib/AskAI.svelte";

  let { data } = $props();
  const github = $derived(`https://github.com/${data.repository}`);
  // The versioned snapshot may record null; widen so the attested shape types.
  const collector = provenance.collector as {
    commit: string;
    workflowRun: string;
  } | null;
  type Artifact = (typeof provenance.artifacts)[number];
  // Brasília wall-clock time, from the instant; pt-BR defaults to a date only.
  const collectedInBrasilia = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(provenance.collectedAt));

  const stages = [
    {
      title: "Coleta na fonte oficial",
      line: "Só a API da Câmara, com URL e horário de cada consulta.",
      status: "Executada",
      description:
        "Consultamos somente a API da Câmara: identificação, ementa, autoria, situação, temas, votações e registros individuais. Cada captura registra URL e instante da consulta.",
      kind: "raw",
      change:
        "JSON recebido → captura datada. Nas respostas de votos, removemos e-mail e URL da foto do deputado. A lista de campos removidos acompanha a captura; ela não é uma cópia byte a byte do HTTP.",
    },
    {
      title: "Validação e normalização",
      line: "Erro de coleta ou validação bloqueia a troca dos dados.",
      status: "Executada",
      description:
        "Effect Schema verifica os contratos. Selecionamos campos, padronizamos nomes e relacionamos proposições a votações. Erros de coleta ou validação impedem a substituição da última coleta publicada.",
      kind: "normalized",
      change:
        "Campos oficiais → modelo do portal. Resumos anteriores só são reutilizados quando o hash de ID e ementa corresponde à versão coletada.",
    },
    {
      title: "Votos e classificação temática",
      line: "Votos e temas são os valores originais, sem recálculo.",
      status: "Executada",
      description:
        "Guardamos posição, deputado, partido e UF do registro, sem atualizar retrospectivamente com o partido atual. Votações compartilhadas não são duplicadas no conjunto de dados.",
      kind: "legislative",
      change:
        "Código temático da Câmara → rótulo estável camara:tema:ID. Sem tema oficial, o projeto permanece sem classificação. Uma lista vazia de votos não vira ausência ou abstenção.",
    },
    {
      title: "Arquivo público e site estático",
      line: "Arquivos com hash. A visita não coleta nem usa IA.",
      status: "Arquivado localmente",
      description:
        "Cada artefato tem chave SHA-256, tamanho e tipo. O manifesto é gravado após os artefatos. O site é reconstruído a partir da última coleta, sem IA ou coleta enquanto você navega.",
      kind: null,
      change:
        "Artefatos → manifesto → páginas pré-renderizadas. A coleta diária roda no GitHub Actions, com atestações assinadas e carimbo OpenTimestamps.",
    },
  ];
  const kinds: Record<string, string> = {
    raw: "Capturas da fonte",
    normalized: "Dados normalizados do portal",
    legislative: "Proposições, temas e votos",
  };
</script>

<svelte:head>
  <title>Transparência da pipeline — Vigia do Povo</title>
  <meta
    name="description"
    content="Confira as fontes, transformações, limitações e artefatos verificáveis que alimentam o Vigia do Povo."
  />
</svelte:head>

{#snippet artifact(entry: Artifact)}
  <li>
    {#if entry.sourceUrl}<a href={entry.sourceUrl}>{entry.sourceUrl}</a><span
        >Captura: {entry.capturedAt} · UTC{entry.redactions.length
          ? " · contato e foto removidos"
          : ""}</span
      >{/if}
    <a href={asset(file(entry.url))} download>{entry.key.split("/").at(-1)}</a>
    <span
      >{entry.bytes.toLocaleString("pt-BR")} bytes · SHA-256 no nome do arquivo</span
    >
  </li>
{/snippet}

<main id="conteudo" class="wrap page">
  <header class="page-head">
    <h1>Origem dos dados</h1>
    <p class="lead">Cada número pode ser conferido.</p>
  </header>

  <ul class="kpis">
    <li class="kpi">
      <time class="kpi-value date" datetime={provenance.collectedAt}
        >{date(provenance.collectedAt)}</time
      >
      <span class="kpi-label">última coleta</span>
    </li>
    <li class="kpi">
      <span class="kpi-value">{provenance.counts.propositions}</span>
      <span class="kpi-label">propostas</span>
    </li>
    <li class="kpi">
      <span class="kpi-value">{provenance.counts.votings}</span>
      <span class="kpi-label">votações</span>
    </li>
  </ul>
  <p class="caveat">Não garante cobertura integral nem correção da IA.</p>
  <details class="disclosure">
    <summary>Detalhes da coleta</summary>
    <dl class="facts">
      <dt>Coleta</dt>
      <dd>
        <time datetime={provenance.collectedAt}
          >{collectedInBrasilia} (Brasília)</time
        >
        <p class="hash">{provenance.collectedAt}</p>
      </dd>
      <dt>Registros individuais de voto</dt>
      <dd>{provenance.counts.ballots}</dd>
      <dt>Temas oficiais</dt>
      <dd>{provenance.counts.labels}</dd>
      <dt>Resumos de IA sem revisão humana</dt>
      <dd>{provenance.counts.summaries}</dd>
    </dl>
  </details>

  <section aria-labelledby="stages-title">
    <h2 id="stages-title">Quatro etapas</h2>
    <ol class="rows">
      {#each stages as stage, index}
        <li>
          <details class="disclosure stage">
            <summary>
              <span class="row-lead step" aria-hidden="true">{index + 1}</span>
              <h3 class="row-title">{stage.title}</h3>
              <span class="row-text clamp-2">{stage.line}</span>
            </summary>
            <div class="stage-body">
              <p>
                <strong>{stage.status}.</strong>
                {stage.description}
              </p>
              <p class="transformation">{stage.change}</p>
              {#if stage.kind}<a
                  class="inspect"
                  href={`#artefatos-${stage.kind}`}
                  >Inspecionar artefatos desta etapa&nbsp;↓</a
                >{/if}
            </div>
          </details>
        </li>
      {/each}
    </ol>
  </section>

  <section aria-labelledby="audit-title">
    <h2 id="audit-title">Arquivos desta coleta</h2>
    <div class="accordion">
      <details class="disclosure">
        <summary>Manifesto da coleta</summary>
        <div class="prose">
          <p>
            O manifesto relaciona os artefatos desta coleta, com seus tamanhos e
            hashes. Os hashes detectam alterações; não certificam a veracidade
            da fonte nem são uma assinatura digital da Câmara. Compare os dados
            com as URLs oficiais indicadas nas capturas.
          </p>
        </div>
        <a
          class="button secondary block"
          href={asset(file(provenance.manifestUrl))}
          download>Baixar manifesto da coleta ↗</a
        >
        <p class="hash">
          SHA-256 do manifesto: <code>{provenance.manifestHash}</code>
        </p>
      </details>

      <details class="disclosure">
        <summary>Como provar a origem</summary>
        <div class="prose">
          <p>
            A coleta roda no GitHub Actions, a partir do código público. O
            GitHub assina o manifesto, <code>legislativo.json</code> e
            <code>dados.json</code>
            com o workflow, o commit e a execução que os produziram. Cada publicação
            do site grava <code>SHA256SUMS</code>, a lista de hashes de todos os
            arquivos publicados, sem atestação. O OpenTimestamps registra no
            Bitcoin, sem custo, que o manifesto já existia naquela data. Isso
            prova que os arquivos saíram do código público sem edição manual,
            desde que você confie no GitHub e na API da Câmara; não é uma
            assinatura da Câmara.
          </p>
          {#if collector}
            <p>
              Esta coleta foi feita pela
              <a href={collector.workflowRun}>execução do GitHub Actions</a>
              no commit <code>{collector.commit.slice(0, 7)}</code>.
            </p>
          {:else}
            <p>
              <strong
                >Esta coleta foi feita fora do GitHub Actions e não tem
                atestação de origem.</strong
              > A próxima coleta agendada substituirá estes dados.
            </p>
          {/if}
        </div>
        <ul class="proofs">
          <li>
            <a href={`${github}/attestations`}
              >Atestações assinadas no GitHub ↗</a
            >
          </li>
          {#if data.timestamp}<li>
              <a
                href={asset(
                  file(
                    `/pipeline/timestamps/${provenance.manifestHash}.json.ots`,
                  ),
                )}
                download>Prova OpenTimestamps do manifesto (.ots) ↗</a
              >
            </li>{/if}
          <li>
            <a href={`${github}/blob/main/VERIFY.md`}
              >Passo a passo da verificação ↗</a
            >
          </li>
        </ul>
      </details>

      {#each ["raw", "normalized", "legislative"] as kind}
        {@const entries = provenance.artifacts.filter(
          (entry) => entry.kind === kind,
        )}
        <details class="disclosure" id={`artefatos-${kind}`}>
          <summary>{kinds[kind]} ({entries.length})</summary>
          <p class="help">
            {#if kind === "raw"}Contato e foto removidos aparecem indicados em
              cada captura.
            {/if}Cada link abre o JSON desta etapa.{#if kind === "normalized"}
              A saída normalizada é uma seleção, não todo o conteúdo da API.{/if}
          </p>
          <ul class="artifacts">
            {#each entries.slice(0, 10) as entry}
              {@render artifact(entry)}
            {/each}
          </ul>
          {#if entries.length > 10}
            <details class="more">
              <summary>Ver todos ({entries.length})</summary>
              <ul class="artifacts">
                {#each entries.slice(10) as entry}
                  {@render artifact(entry)}
                {/each}
              </ul>
            </details>
          {/if}
        </details>
      {/each}
    </div>
  </section>

  <section aria-labelledby="more-title">
    <h2 id="more-title">Mais detalhes</h2>
    <div class="accordion">
      <details class="disclosure">
        <summary>Como os campos da fonte viram dados do portal</summary>
        <div class="prose">
          <ul class="field-mapping">
            <li>
              <code>codTema</code> → <code>labels[].id</code>: prefixo
              <code>camara:tema:</code>
              + código oficial. <code>tema</code> vira <code>name</code>;
              <code>relevancia</code>
              é preservada em <code>relevance</code>, sem recalcular.
            </li>
            <li>
              <code>tipoVoto</code> → <code>ballots[].vote</code>: texto
              oficial, sem converter posição em apoio ou oposição ao mérito.
            </li>
            <li>
              <code>deputado_.id/nome/siglaPartido/siglaUf/idLegislatura</code>
              →
              <code>deputyId/name/party/state/legislature</code>: identificação
              e valores do registro, sem consulta ao cadastro atual.
            </li>
            <li>
              <code>dataRegistroVoto</code> → <code>registeredAt</code>: valor
              original. Ausente vira <code>null</code>; não adicionamos um fuso
              presumido.
            </li>
            <li>
              Proposta ↔ votação: IDs das relações oficiais, com uma única lista
              de votos por votação. Duplicação de deputado na mesma votação
              interrompe a coleta.
            </li>
            <li>
              <code>[id, ementa]</code> → <code>sourceHash</code>: SHA-256 usado
              apenas para verificar a compatibilidade dos resumos da ementa. Não
              é o hash do documento integral.
            </li>
          </ul>
        </div>
      </details>

      <details class="disclosure">
        <summary>O que ainda não prometemos</summary>
        <div class="prose">
          <p>
            {provenance.coverage}. Não analisamos os PDFs, as emendas ou os
            substitutivos. Votações processuais não equivalem à aprovação de uma
            lei. Ausência de registro individual não comprova ausência ou
            abstenção de um deputado.
          </p>
          <ul class="limits">
            <li>
              Não cobrimos todo o Congresso, todos os anos nem os votos do
              Senado. A amostra usa seis PLs recentes do ano e oito votações
              recentes do mês, além das propostas já acompanhadas e dos IDs
              escolhidos explicitamente na coleta.
            </li>
            <li>
              Os registros individuais não garantem uma lista completa de
              presenças. Partido e UF são os valores do registro, não uma
              reconstrução certificada da filiação histórica.
            </li>
            <li>
              Temas são classificações oficiais. Não fazemos ranking ideológico,
              agrupamento semântico nem inferência sobre intenção de voto.
            </li>
            <li>
              Os resumos publicados explicam só a ementa e estão marcados como
              IA sem revisão humana. Não houve nova inferência nesta execução, e
              não há dados de modelo ou transcrição que permitam reproduzir
              exatamente essa geração anterior.
            </li>
            <li>
              Não há fila distribuída, agendamento, auditoria independente,
              publicação automática, S3 ativo ou garantia de retenção
              permanente. Os artefatos locais preservados por hash precisam
              acompanhar a hospedagem para seus links continuarem disponíveis.
            </li>
            <li>
              A publicação local usa renomeação por arquivo, não uma transação
              entre todos os arquivos. Deve haver um único processo de coleta
              por vez; falhas de disco na publicação exigem nova execução.
            </li>
          </ul>
        </div>
      </details>

      <details class="disclosure">
        <summary>Usar com IA</summary>
        <AskAI
          href={resolve("transparencia.md")}
          what="como estes dados foram coletados"
        />
      </details>
    </div>
  </section>

  <ul class="rows">
    <li class="row tap">
      <div class="row-main">
        <a class="row-title" href={resolve("dados/")}>Explorar votos e temas</a>
      </div>
      <span class="chev" aria-hidden="true"></span>
    </li>
    <li class="row tap">
      <div class="row-main">
        <a class="row-title" href={resolve("sobre/")}
          >Fontes, legislação e privacidade</a
        >
      </div>
      <span class="chev" aria-hidden="true"></span>
    </li>
    <li class="row tap">
      <div class="row-main">
        <a
          class="row-title"
          href="https://dadosabertos.camara.leg.br/"
          target="_blank"
          rel="noreferrer">API oficial da Câmara ↗</a
        >
      </div>
    </li>
  </ul>
</main>

<style>
  section {
    margin-top: 28px;
  }
  section + .rows {
    margin-top: 16px;
  }
  .caveat {
    margin: 12px 0 0;
  }
  .step {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.3;
    color: var(--accent-text);
  }
  .rows > li + li {
    border-top: 1px solid var(--divider);
  }
  .stage summary {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 8px;
    column-gap: 12px;
    align-items: start;
    align-content: center;
    min-height: 60px;
    padding: 12px 14px;
    list-style: none;
  }
  .stage summary::-webkit-details-marker {
    display: none;
  }
  .stage .step {
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .stage h3 {
    grid-column: 2;
    grid-row: 1;
    margin: 0;
  }
  .stage .row-text {
    grid-column: 2;
    grid-row: 2;
    font-weight: 400;
  }
  .stage summary::after {
    grid-column: 3;
    grid-row: 1 / span 2;
    align-self: center;
  }
  .stage {
    margin-top: 0;
    border-top: 0;
  }
  .stage[open] {
    padding-bottom: 0;
  }
  .stage-body {
    padding: 0 14px 14px 50px;
  }
  .stage-body p {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-2);
  }
  .transformation {
    padding: 12px 14px;
    background: var(--surface-alt);
    border-left: 2px solid var(--accent-strong);
  }
  .inspect {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
    color: var(--green);
  }
  .accordion .button {
    margin-top: 8px;
  }
  .proofs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .field-mapping li,
  .limits li {
    margin-block: 12px;
  }
  .field-mapping {
    overflow-wrap: anywhere;
  }
  .facts .hash {
    margin: 4px 0 0;
    font-weight: 400;
    color: var(--muted);
  }
  .help {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }
  .artifacts {
    list-style: none;
    padding-left: 0;
  }
  .artifacts li {
    display: flex;
    flex-direction: column;
    gap: 7px;
    border-top: 1px solid var(--line);
    padding: 14px 0;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .artifacts a {
    display: flex;
    align-items: center;
    min-height: 44px;
  }
  .artifacts span {
    color: var(--muted);
    font-size: 11px;
  }
</style>
