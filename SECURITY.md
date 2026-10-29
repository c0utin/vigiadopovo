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

## Dependências

Rode `pnpm audit` regularmente. A migração inicial para SvelteKit 3 corrigiu os alertas conhecidos de SvelteKit 2 e de sua dependência `cookie`. Em 29/10/2026, permanece um alerta de baixa severidade, sem correção publicada, em `deepmerge`, dependência transitiva do plugin Svelte de build ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). O projeto não passa configurações não confiáveis para esse plugin; isso não é uma garantia geral de ausência de risco. A CI rejeita alertas de severidade moderada ou superior, sem suprimir esse alerta da auditoria.
