# Segurança

## Relatar um problema

Não publique credenciais, dados pessoais ou detalhes exploráveis em issues públicas. Use a opção **Security → Report a vulnerability** deste repositório quando estiver habilitada. Caso esteja indisponível, abra uma issue apenas solicitando um canal privado, sem incluir o conteúdo sensível, e aguarde instruções do mantenedor.

Se uma credencial for exposta, revogue-a ou faça sua rotação primeiro. Remover o arquivo ou reescrever o histórico não torna uma credencial exposta segura novamente.

## Limites do projeto

- O site publicado é estático. Não requer credenciais, banco ou serviço de inferência para leitura.
- A coleta consulta hosts HTTPS explícitos da Câmara e rejeita redirecionamentos da API. O conteúdo da fonte é tratado como dado, nunca como instrução ou HTML executável.
- Arquivos `.env`, chaves locais, dependências, builds, logs e artefatos da prévia não devem ser versionados. O `.gitignore` reduz acidentes, mas não substitui a revisão do conteúdo enviado.
- Nomes de autores legislativos e documentos oficiais são dados públicos intencionais. Isso não autoriza a inclusão de contatos pessoais, perfis de cidadãos ou documentos privados.
- Resumos por IA podem conter erros. A fonte original e os limites editoriais são parte essencial da segurança da informação.
- A pipeline genérica prepara contextos em memória; só exporta arquivos locais quando solicitado. `.pipeline/` não é público e é ignorado pelo Git. Não coloque esses artefatos em `static/` nem trate um rascunho como conteúdo revisado.
- O publicador `data:sync`, separadamente, grava artefatos públicos em `static/pipeline/`, além do conjunto de votos. Não faz inferência nem copia a pasta editorial privada. Remove e-mail e URL de foto das capturas de votos e declara as remoções. Revise os dados públicos antes de versionar/publicar: a origem governamental não dispensa minimização e verificação.
- S3 e inferência são configurações de servidor. `.env.example` contém apenas nomes de variáveis e valores fictícios; `.env` real nunca deve ser enviado ao repositório. Não use prefixos `PUBLIC_` ou exponha credenciais no navegador. Não existem credenciais ou permissões de publicação social no projeto.
- O adaptador S3 não provisiona infraestrutura nem torna objetos públicos. Configure bucket privado, permissões mínimas, criptografia e retenção no provedor antes de habilitar uploads. Compatibilidade e configuração reais do provedor precisam de validação separada.
- Evidências com IDs válidos não garantem veracidade da redação de IA. A revisão humana deve conferir a interpretação e a atualidade. Instruções contra prompt injection não são isolamento completo; nenhuma ferramenta de publicação é oferecida ao modelo.

## Dependências

Rode `pnpm audit` regularmente. A migração inicial para SvelteKit 3 corrigiu os alertas conhecidos de SvelteKit 2 e de sua dependência `cookie`. Em 29/10/2026, permanece um alerta de baixa severidade, sem correção publicada, em `deepmerge`, dependência transitiva do plugin Svelte de build ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). O projeto não passa configurações não confiáveis para esse plugin; isso não é uma garantia geral de ausência de risco. A CI rejeita alertas de severidade moderada ou superior, sem suprimir esse alerta da auditoria.
