<script lang="ts">
  import { asset, resolve } from "$app/paths";
</script>

<svelte:head
  ><title>Fontes, método e privacidade — Vigia do Povo</title><meta
    name="description"
    content="Conheça as fontes oficiais, os limites dos resumos por IA e as referências legais do Vigia do Povo."
  /></svelte:head
>
<main id="conteudo" class="wrap page">
  <header class="page-head">
    <h1>Como o Vigia funciona</h1>
    <p class="lead">
      Iniciativa independente: sem governo, sem partido e sem recomendação de
      voto.
    </p>
  </header>

  <ul class="rows">
    <li class="row">
      <div class="row-main">
        <p class="row-title">Dados só da Câmara</p>
        <p class="row-text clamp-2">
          Vêm da API oficial de Dados Abertos da Câmara dos Deputados.
        </p>
      </div>
    </li>
    <li class="row">
      <div class="row-main">
        <p class="row-title">Resumos feitos por IA</p>
        <p class="row-text clamp-2">
          Escritos por IA, sem revisão humana. Podem conter erros.
        </p>
      </div>
    </li>
    <li class="row">
      <div class="row-main">
        <p class="row-title">Proposta não é lei</p>
        <p class="row-text clamp-2">
          Aprovar uma etapa não significa lei aprovada ou em vigor.
        </p>
      </div>
    </li>
  </ul>

  <section aria-labelledby="questions-title">
    <h2 id="questions-title" class="sr-only">Perguntas frequentes</h2>
    <div class="accordion">
      <details class="disclosure">
        <summary>De onde vêm os dados?</summary>
        <p class="prose">
          Só da
          <a
            href="https://dadosabertos.camara.leg.br/"
            target="_blank"
            rel="noreferrer">Câmara dos Deputados</a
          >, pela
          <a
            href="https://dadosabertos.camara.leg.br/swagger/api.html"
            target="_blank"
            rel="noreferrer">API oficial de Dados Abertos</a
          >. Domínios .leg.br são fontes oficiais do Poder Legislativo, não
          apenas .gov.br. Não usamos notícias, redes sociais nem dados
          inventados.
        </p>
        <a class="button secondary" href={asset("dados.json")} download
          >Baixar a coleta em JSON ↗</a
        >
      </details>

      <details class="disclosure">
        <summary>Quanto está coberto?</summary>
        <p class="prose">
          É uma amostra, não a cobertura completa da Câmara: os seis projetos de
          lei com IDs mais recentes do ano e as propostas ligadas às oito
          votações mais recentes do mês. Propostas já coletadas continuam sendo
          atualizadas. Não incluímos o Senado, assembleias estaduais, câmaras
          municipais nem a pauta futura.
        </p>
      </details>

      <details class="disclosure">
        <summary>Como os resumos são feitos?</summary>
        <p class="prose">
          Os primeiros resumos foram escritos por IA, só com base na ementa
          oficial. Nenhuma pessoa os revisou, e podem conter erros. Não
          inferimos custos, consequências, prazos, resultados ou posições
          políticas ausentes na ementa. Se a ementa de uma proposta mudar, o
          resumo sai do ar e volta à fila.
        </p>
        <p class="prose">
          Não há atualização agendada, publicação automática nem chamada de IA
          durante a visita. Novos resumos são feitos com IA fora do site e
          acrescentados ao arquivo de resumos.
        </p>
        <details class="disclosure">
          <summary>Como a verificação funciona</summary>
          <p class="prose">
            O pipeline compara um hash SHA-256 do ID e da ementa com a versão
            usada no resumo. Esse hash não verifica mudanças no PDF: a análise
            integral de versões, emendas e substitutivos fica para uma etapa
            futura. Os documentos integrais são vinculados, mas não foram
            analisados para esses resumos.
          </p>
        </details>
      </details>

      <details class="disclosure">
        <summary>Proposta, votação e lei são coisas diferentes</summary>
        <p class="prose">
          Mostramos a situação e o andamento informados pela Câmara. Uma votação
          pode tratar de urgência, destaque ou outra etapa; aprovar em uma delas
          não prova aprovação final, sanção ou entrada em vigor. Para acompanhar
          mudanças, consulte a ficha oficial.
        </p>
      </details>

      <details class="disclosure">
        <summary>Referências legais consultadas</summary>
        <p class="prose">
          Essas referências orientam o projeto; não são parecer jurídico nem
          certificação de conformidade. Uma operação pública deve avaliar suas
          obrigações e definir responsável e canal de atendimento.
        </p>
        <ul class="refs">
          <li>
            <a
              href="https://www2.camara.leg.br/legin/fed/lei/2011/lei-12527-18-novembro-2011-611802-normaatualizada-pl.html"
              target="_blank"
              rel="noreferrer"
              ><strong>Lei de Acesso à Informação · Lei 12.527/2011 ↗</strong
              ><span
                >Arts. 3º, 5º, 7º e 8º: publicidade, linguagem compreensível,
                integridade, atualização e acesso em formatos abertos. O art. 31
                protege informações pessoais.</span
              ></a
            >
          </li>
          <li>
            <a
              href="https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html"
              target="_blank"
              rel="noreferrer"
              ><strong>Direitos autorais · Lei 9.610/1998 ↗</strong><span
                >Art. 8º, IV: textos de leis e demais atos oficiais não são
                objeto de proteção autoral. Isso não autoriza copiar
                indiscriminadamente fotografias, marcas e outros conteúdos de
                sites públicos.</span
              ></a
            >
          </li>
          <li>
            <a
              href="https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html"
              target="_blank"
              rel="noreferrer"
              ><strong>LGPD · Lei 13.709/2018 ↗</strong><span
                >Art. 6º e art. 7º, §§ 3º, 4º e 6º: finalidade, necessidade,
                boa-fé e direitos dos titulares continuam relevantes para dados
                públicos.</span
              ></a
            >
          </li>
        </ul>
      </details>

      <details class="disclosure">
        <summary>Privacidade e correções</summary>
        <p class="prose">
          Sem cadastro, cookies próprios, publicidade, analytics ou
          armazenamento de buscas. Publicamos apenas nomes de autores na
          atividade legislativa, sem contatos pessoais, CPF ou perfis de
          cidadãos. A hospedagem pode processar logs de acesso conforme a
          política dela.
        </p>
        <p class="prose">
          Para corrigir um resumo, compare-o com a ementa no link oficial e
          solicite a alteração no repositório deste projeto, informando o número
          da proposta. Se o erro estiver na fonte, use o
          <a
            href="https://www.camara.leg.br/fale-conosco"
            target="_blank"
            rel="noreferrer">Fale Conosco da Câmara</a
          >.
        </p>
      </details>
    </div>
  </section>

  <ul class="rows">
    <li class="row tap">
      <div class="row-main">
        <a class="row-title" href={resolve("transparencia/")}
          >Como cada dado é coletado</a
        >
        <p class="row-text clamp-2">Etapas, arquivos e como conferir.</p>
      </div>
      <span class="chev" aria-hidden="true"></span>
    </li>
  </ul>
</main>

<style>
  .page-head {
    padding-bottom: 20px;
  }
  .lead {
    margin: 0;
  }
  section {
    margin-top: 28px;
  }
  .accordion .button {
    margin-top: 8px;
  }
  .refs {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .refs a {
    display: block;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    text-decoration: none;
  }
  .refs strong {
    font-size: 15px;
  }
  .refs span {
    display: block;
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }
</style>
