<script lang="ts">
  import { asset, resolve } from "$app/paths";
</script>

<svelte:head
  ><title>Fontes, método e privacidade — Vigia do Povo</title><meta
    name="description"
    content="Conheça as fontes oficiais, os limites dos resumos por IA e as referências legais do Vigia do Povo."
  /></svelte:head
>
<main id="conteudo" class="wrap about-page">
  <a class="back-link" href={resolve("/")}>← Voltar ao início</a>
  <p class="eyebrow">NOSSO COMPROMISSO</p>
  <h1>Transparência também<br />sobre o que fazemos.</h1>
  <p class="lead">
    Somos uma iniciativa independente. Não somos um órgão público, não
    representamos partidos e não recomendamos votos.
  </p>
  <h2>De onde vêm os dados?</h2>
  <p>
    Exclusivamente da <a
      href="https://dadosabertos.camara.leg.br/"
      target="_blank"
      rel="noreferrer">Câmara dos Deputados</a
    >, por sua
    <a
      href="https://dadosabertos.camara.leg.br/swagger/api.html"
      target="_blank"
      rel="noreferrer">API oficial de Dados Abertos</a
    >. Domínios .leg.br são fontes oficiais do Poder Legislativo brasileiro; não
    apenas .gov.br. Não usamos notícias, redes sociais ou dados inventados.
  </p>
  <h2>O recorte deste MVP</h2>
  <p>
    A coleta descobre os seis projetos de lei com IDs mais recentes do ano
    corrente e as proposições afetadas pelas oito votações mais recentes do mês.
    Propostas já coletadas continuam sendo atualizadas. Isso é uma amostra, não
    a cobertura completa da Câmara, nem a pauta futura. Não inclui o Senado,
    assembleias estaduais ou câmaras municipais.
  </p>
  <h2>Como os resumos são feitos?</h2>
  <p>
    Os primeiros resumos foram produzidos pela inferência do assistente neste
    chat, com base apenas na ementa retornada pela API. Não foram revisados por
    uma pessoa e podem conter erros. O documento integral é vinculado, mas não
    foi analisado para esses resumos. Não inferimos custos, consequências,
    prazos, resultados ou posições políticas ausentes na ementa.
  </p>
  <p>
    O pipeline compara um hash SHA-256 do ID e da ementa com a versão usada no
    resumo. Se ela mudar, o texto simplificado deixa de ser publicado e volta à
    fila. Esse hash não verifica mudanças no PDF: a análise integral de versões,
    emendas e substitutivos fica para uma etapa futura.
  </p>
  <p>
    Este chat não é um serviço de inferência permanente. A coleta é executável
    por comando; novos resumos precisam ser produzidos neste chat e adicionados
    ao arquivo de resumos. Não há atualização agendada, publicação automática ou
    chamada de IA durante a visita.
  </p>
  <h2>Proposta, votação e lei são coisas diferentes</h2>
  <p>
    Reproduzimos a situação e a descrição do andamento fornecidas pela Câmara.
    As votações relacionadas podem tratar de urgência, destaques ou outras
    etapas. Aprovação em uma delas não prova aprovação final, sanção ou entrada
    em vigor. Para acompanhar mudanças, consulte a ficha oficial.
  </p>
  <h2>Referências legais consultadas</h2>
  <div class="legal-list">
    <a
      href="https://www2.camara.leg.br/legin/fed/lei/2011/lei-12527-18-novembro-2011-611802-normaatualizada-pl.html"
      target="_blank"
      rel="noreferrer"
      ><strong>Lei de Acesso à Informação · Lei 12.527/2011 ↗</strong><span
        >Arts. 3º, 5º, 7º e 8º: publicidade, linguagem compreensível,
        integridade, atualização e acesso em formatos abertos. O art. 31 protege
        informações pessoais.</span
      ></a
    ><a
      href="https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html"
      target="_blank"
      rel="noreferrer"
      ><strong>Direitos autorais · Lei 9.610/1998 ↗</strong><span
        >Art. 8º, IV: textos de leis e demais atos oficiais não são objeto de
        proteção autoral. Isso não autoriza copiar indiscriminadamente
        fotografias, marcas e outros conteúdos de sites públicos.</span
      ></a
    ><a
      href="https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html"
      target="_blank"
      rel="noreferrer"
      ><strong>LGPD · Lei 13.709/2018 ↗</strong><span
        >Art. 6º e art. 7º, §§ 3º, 4º e 6º: finalidade, necessidade, boa-fé e
        direitos dos titulares continuam relevantes para dados públicos.</span
      ></a
    >
  </div>
  <p class="muted">
    Essas referências orientam o projeto; não constituem parecer jurídico ou
    certificação de conformidade. Uma operação pública deve avaliar suas
    obrigações e definir responsável e canal de atendimento.
  </p>
  <h2>Privacidade e correções</h2>
  <p>
    O aplicativo não possui cadastro, cookies próprios, publicidade, analytics
    ou armazenamento de buscas. Publica apenas nomes de autores em sua atividade
    legislativa, sem contatos pessoais, CPF ou perfis de cidadãos. A hospedagem
    pode processar logs de acesso conforme sua própria política.
  </p>
  <p>
    Para corrigir um resumo, compare-o com a ementa no link oficial e solicite a
    alteração no repositório deste projeto ou neste chat, informando o número da
    proposta. Se o erro for na fonte, use o <a
      href="https://www.camara.leg.br/fale-conosco"
      target="_blank"
      rel="noreferrer">Fale Conosco da Câmara</a
    >.
  </p>
  <a class="button primary" href={asset("dados.json")} download
    >Baixar a coleta em JSON ↗</a
  >
</main>
