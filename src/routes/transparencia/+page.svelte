<script lang="ts">
  import { asset, resolve } from "$app/paths";
  // Provenance stores root-relative URLs; asset() adds the deploy base path.
  const file = (url: string) => url.slice(1) as Parameters<typeof asset>[0];
  import provenance from "#lib/data/provenance.json";
  import { date } from "#lib/format.ts";

  let { data } = $props();
  const github = $derived(`https://github.com/${data.repository}`);
  // The versioned snapshot may record null; widen so the attested shape types.
  const collector = provenance.collector as {
    commit: string;
    workflowRun: string;
  } | null;

  const stages = [
    {
      title: "Coleta na fonte oficial",
      status: "Executada",
      description:
        "Consultamos somente a API da Câmara: identificação, ementa, autoria, situação, temas, votações e registros individuais. Cada captura registra URL e instante da consulta.",
      kind: "raw",
      change:
        "JSON recebido → captura datada. Nas respostas de votos, removemos e-mail e URL da foto do deputado. A lista de campos removidos acompanha a captura; ela não é uma cópia byte a byte do HTTP.",
    },
    {
      title: "Validação e normalização",
      status: "Executada",
      description:
        "Effect Schema verifica os contratos. Selecionamos campos, padronizamos nomes e relacionamos proposições a votações. Erros de coleta ou validação impedem a substituição do último snapshot.",
      kind: "normalized",
      change:
        "Campos oficiais → modelo do portal. Resumos anteriores só são reutilizados quando o hash de ID e ementa corresponde à versão coletada.",
    },
    {
      title: "Votos e classificação temática",
      status: "Executada",
      description:
        "Guardamos posição, deputado, partido e UF do registro, sem atualizar retrospectivamente com o partido atual. Votações compartilhadas não são duplicadas no conjunto de dados.",
      kind: "legislative",
      change:
        "Código temático da Câmara → rótulo estável camara:tema:ID. Sem tema oficial, o projeto permanece sem classificação. Uma lista vazia de votos não vira ausência ou abstenção.",
    },
    {
      title: "Arquivo público e site estático",
      status: "Arquivado localmente",
      description:
        "Cada artefato tem chave SHA-256, tamanho e tipo. O manifesto é gravado após os artefatos. O site é reconstruído a partir do snapshot, sem IA ou coleta enquanto você navega.",
      kind: null,
      change:
        "Artefatos → manifesto → páginas pré-renderizadas. A coleta diária roda no GitHub Actions, com atestações assinadas e carimbo OpenTimestamps.",
    },
  ];
  const kinds: Record<string, string> = {
    raw: "Capturas da fonte (com remoções indicadas)",
    normalized: "Snapshot normalizado do portal",
    legislative: "Proposições, temas e votos individuais",
  };
</script>

<svelte:head>
  <title>Transparência da pipeline — Vigia do Povo</title>
  <meta
    name="description"
    content="Confira as fontes, transformações, limitações e artefatos verificáveis que alimentam o Vigia do Povo."
  />
</svelte:head>

<main id="conteudo" class="wrap transparency-page">
  <p class="eyebrow">TRANSPARÊNCIA TAMBÉM SOBRE NÓS</p>
  <h1>Do dado à tela.<br /><em>Sem caixa-preta.</em></h1>
  <p class="intro">
    Você não precisa confiar só no resumo. Aqui estão as etapas, as escolhas e
    os arquivos que permitem conferir como a informação foi transformada.
  </p>

  <section class="collection" aria-label="Identificação da coleta">
    <div>
      <span class="eyebrow">ÚLTIMA COLETA PUBLICADA NESTE SNAPSHOT</span>
      <h2>{date(provenance.collectedAt)} <small>Brasília</small></h2>
      <time datetime={provenance.collectedAt}
        >{provenance.collectedAt} · UTC</time
      >
    </div>
    <div class="counts">
      <strong>{provenance.counts.propositions} propostas</strong><span
        >{provenance.counts.votings} votações · {provenance.counts.ballots} registros
        individuais</span
      ><span
        >{provenance.counts.labels} temas oficiais · {provenance.counts
          .summaries} resumos de IA sem revisão humana</span
      >
    </div>
  </section>
  <aside class="notice">
    <strong
      >Transparência não é garantia de cobertura integral ou de correção da IA.</strong
    >
    <p>
      {provenance.coverage}. Não analisamos os PDFs, as emendas ou os
      substitutivos. Votações processuais não equivalem à aprovação de uma lei.
      Ausência de registro individual não comprova ausência ou abstenção de um
      deputado.
    </p>
  </aside>

  <section aria-labelledby="stages-title">
    <h2 id="stages-title">O que acontece em cada etapa</h2>
    <ol class="stages">
      {#each stages as stage, index}
        <li>
          <span class="step-number" aria-hidden="true"
            >{String(index + 1).padStart(2, "0")}</span
          >
          <div>
            <p class="eyebrow">{stage.status}</p>
            <h3>{stage.title}</h3>
            <p>{stage.description}</p>
            <details class="stage-details">
              <summary>Ver a transformação</summary>
              <p class="transformation">{stage.change}</p>
            </details>
            {#if stage.kind}<a href={`#artefatos-${stage.kind}`}
                >Inspecionar artefatos desta etapa ↓</a
              >{/if}
          </div>
        </li>
      {/each}
    </ol>
    <details>
      <summary>Como os campos da fonte viram dados do portal</summary>
      <ul class="field-mapping">
        <li>
          <code>codTema</code> → <code>labels[].id</code>: prefixo
          <code>camara:tema:</code>
          + código oficial. <code>tema</code> vira <code>name</code>;
          <code>relevancia</code>
          é preservada em <code>relevance</code>, sem recalcular.
        </li>
        <li>
          <code>tipoVoto</code> → <code>ballots[].vote</code>: texto oficial,
          sem converter posição em apoio ou oposição ao mérito.
        </li>
        <li>
          <code>deputado_.id/nome/siglaPartido/siglaUf/idLegislatura</code> →
          <code>deputyId/name/party/state/legislature</code>: identificação e
          valores do registro, sem consulta ao cadastro atual.
        </li>
        <li>
          <code>dataRegistroVoto</code> → <code>registeredAt</code>: valor
          original. Ausente vira <code>null</code>; não adicionamos um fuso
          presumido.
        </li>
        <li>
          Proposta ↔ votação: IDs das relações oficiais, com uma única lista de
          votos por votação. Duplicação de deputado na mesma votação interrompe
          a coleta.
        </li>
        <li>
          <code>[id, ementa]</code> → <code>sourceHash</code>: SHA-256 usado
          apenas para verificar a compatibilidade dos resumos da ementa. Não é o
          hash do documento integral.
        </li>
      </ul>
    </details>
  </section>

  <section class="audit" aria-labelledby="audit-title">
    <p class="eyebrow">VERIFICÁVEL, NÃO APENAS EXPLICADO</p>
    <h2 id="audit-title">Confira os arquivos desta execução</h2>
    <p>
      O manifesto relaciona os artefatos desta coleta, com seus tamanhos e
      hashes. Os hashes detectam alterações; não certificam a veracidade da
      fonte nem são uma assinatura digital da Câmara. Compare os dados com as
      URLs oficiais indicadas nas capturas.
    </p>
    <a
      class="button primary"
      href={asset(file(provenance.manifestUrl))}
      download>Baixar manifesto da execução ↗</a
    >
    <p class="hash">
      SHA-256 do manifesto: <code>{provenance.manifestHash}</code>
    </p>
    <h3>Como provar a origem</h3>
    <p>
      A coleta roda no GitHub Actions, a partir do código público. O GitHub
      assina o manifesto, <code>legislativo.json</code> e
      <code>dados.json</code>
      com o workflow, o commit e a execução que os produziram, e a publicação do site
      assina <code>SHA256SUMS</code>, a lista de hashes de todos os arquivos
      publicados. O OpenTimestamps registra no Bitcoin, sem custo, que o
      manifesto já existia naquela data. Isso prova que os arquivos saíram do
      código público sem edição manual, desde que você confie no GitHub e na API
      da Câmara; não é uma assinatura da Câmara.
    </p>
    {#if collector}<p>
        Esta coleta foi feita pela
        <a href={collector.workflowRun}>execução do GitHub Actions</a>
        no commit <code>{collector.commit.slice(0, 7)}</code>.
      </p>{:else}<p>
        <strong
          >Esta coleta foi feita fora do GitHub Actions e não tem atestação de
          origem.</strong
        > A próxima coleta agendada substituirá este snapshot.
      </p>{/if}
    <ul class="proofs">
      <li>
        <a href={`${github}/attestations`}>Atestações assinadas no GitHub ↗</a>
      </li>
      {#if data.timestamp}<li>
          <a
            href={asset(
              file(`/pipeline/timestamps/${provenance.manifestHash}.json.ots`),
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
    {#each ["raw", "normalized", "legislative"] as kind}
      {@const entries = provenance.artifacts.filter(
        (entry) => entry.kind === kind,
      )}
      <details id={`artefatos-${kind}`}>
        <summary>{kinds[kind]} ({entries.length})</summary>
        <p class="help">
          Cada link abre o JSON daquela etapa. Capturas incluem URL e horário da
          consulta; as remoções de contato e foto estão indicadas no próprio
          arquivo. A saída normalizada é uma seleção, não todo o conteúdo da
          API.
        </p>
        <ul class="artifacts">
          {#each entries as entry}<li>
              {#if entry.sourceUrl}<a href={entry.sourceUrl}
                  >{entry.sourceUrl}</a
                ><span
                  >Captura: {entry.capturedAt} · UTC{entry.redactions.length
                    ? " · contato e foto removidos"
                    : ""}</span
                >{/if}
              <a href={asset(file(entry.url))} download
                >{entry.key.split("/").at(-1)}</a
              ><span
                >{entry.bytes.toLocaleString("pt-BR")} bytes · SHA-256 no nome do
                arquivo</span
              >
            </li>{/each}
        </ul>
      </details>
    {/each}
  </section>

  <section class="limits" aria-labelledby="limits-title">
    <h2 id="limits-title">O que ainda não prometemos</h2>
    <ul>
      <li>
        Não cobrimos todo o Congresso, todos os anos nem os votos do Senado. O
        recorte de descoberta usa seis PLs recentes do ano e oito votações
        recentes do mês, além das propostas já acompanhadas e dos IDs escolhidos
        explicitamente na coleta.
      </li>
      <li>
        Os registros individuais disponíveis não são garantia de uma lista
        completa de presenças. Partido e UF são os valores do registro, não uma
        reconstrução certificada da filiação histórica.
      </li>
      <li>
        Temas são classificações oficiais. Não fazemos ranking ideológico,
        clustering semântico ou inferência sobre intenção de voto.
      </li>
      <li>
        Os resumos já publicados explicam só a ementa e estão marcados como IA
        sem revisão humana. Não houve nova inferência nesta execução. Não há
        dados de modelo ou transcrição do chat que permitam reproduzir
        exatamente essa geração anterior.
      </li>
      <li>
        Não há fila distribuída, agendamento, auditoria independente, publicação
        automática, S3 ativo ou garantia de retenção permanente. Os artefatos
        locais preservados por hash precisam acompanhar a hospedagem para seus
        links continuarem disponíveis.
      </li>
      <li>
        A publicação local usa renomeação por arquivo, não uma transação entre
        todos os arquivos. Deve haver um único processo de coleta por vez;
        falhas de disco na publicação exigem nova execução.
      </li>
    </ul>
    <p>
      <a href={resolve("dados/")}>Explorar votos e temas →</a> ·
      <a href={resolve("sobre/")}>Fontes, legislação e privacidade →</a>
      ·
      <a href="https://dadosabertos.camara.leg.br/">API oficial da Câmara ↗</a>
    </p>
  </section>
</main>

<style>
  .transparency-page {
    padding-block: 24px 40px;
  }
  h1 {
    font-size: clamp(34px, 6vw, 64px);
    letter-spacing: -1.2px;
    line-height: 1.12;
    margin-block: 16px;
  }
  h1 em {
    font-family: Georgia, serif;
    font-weight: 400;
  }
  .intro {
    max-width: 750px;
    font-size: 16px;
    line-height: 1.7;
    color: var(--muted);
  }
  section {
    margin-block: 38px;
  }
  .collection {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
    padding: 20px;
    background: #edf0e5;
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .collection h2 {
    margin: 12px 0;
    font-size: 30px;
  }
  .collection h2 small {
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  time,
  .counts span {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.7;
  }
  .counts {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }
  .counts strong {
    font-size: 23px;
  }
  .stages {
    display: grid;
    gap: 14px;
    padding: 0;
    list-style: none;
  }
  .stages li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    padding: 18px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
  }
  .step-number {
    font-family: Georgia, serif;
    font-size: 25px;
    color: #637b3d;
  }
  h3 {
    font-size: 22px;
    margin: 10px 0;
  }
  .stages p,
  .audit > p,
  .limits {
    line-height: 1.7;
    max-width: 920px;
  }
  .stages p {
    font-size: 15px;
    color: var(--muted);
  }
  .stages .eyebrow {
    font-size: 10px;
    margin-top: 5px;
  }
  .transformation {
    padding: 14px 18px;
    background: #f0f1e8;
    border-left: 2px solid #829d50;
    font-size: 13px;
  }
  .stages a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 13px;
  }
  .stage-details {
    padding-block: 0;
  }
  .audit {
    padding-block: 8px;
  }
  .proofs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .hash {
    font-size: 11px;
  }
  details {
    scroll-margin-top: 24px;
    padding-block: 18px;
  }
  .help {
    font-size: 12px;
    line-height: 1.8;
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
  .artifacts span {
    color: var(--muted);
    font-size: 11px;
  }
  .limits {
    border-top: 1px solid var(--line);
    padding-top: 28px;
  }
  .limits li {
    margin-block: 12px;
  }
  .field-mapping {
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .field-mapping li {
    margin-block: 12px;
  }
  @media (min-width: 651px) {
    .collection {
      flex-direction: row;
      padding: 28px;
    }
    .stages li {
      grid-template-columns: 48px minmax(0, 1fr);
      padding: 24px;
      gap: 20px;
    }
    .step-number {
      font-size: 36px;
    }
  }
</style>
