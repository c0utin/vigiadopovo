# Segurança

## Relatar um problema

Não publique credenciais, dados pessoais ou detalhes exploráveis em issues públicas. Use a opção **Security → Report a vulnerability** deste repositório quando estiver habilitada. Caso esteja indisponível, abra uma issue apenas solicitando um canal privado, sem incluir o conteúdo sensível, e aguarde instruções do mantenedor.

Se uma credencial for exposta, revogue-a ou faça sua rotação primeiro. Remover o arquivo ou reescrever o histórico não torna uma credencial exposta segura novamente.

## Limites do projeto

- O site publicado é estático. Não requer credenciais, banco de dados ou serviço externo para leitura.
- A coleta consulta apenas hosts HTTPS explícitos da Câmara e rejeita redirecionamentos da API. O conteúdo da fonte é tratado como dado, nunca como instrução ou HTML executável.
- Arquivos `.env`, chaves locais, dependências, builds, logs e artefatos da prévia não devem ser versionados. O `.gitignore` reduz acidentes, mas não substitui a revisão do conteúdo enviado.
- `pnpm data:sync` grava arquivos públicos em `static/pipeline/`, incluindo capturas de votos. Essas capturas removem e-mail e URL de foto antes de serem arquivadas, e a remoção é declarada em `redactions`. Revise os dados antes de publicar: a origem governamental não dispensa minimização e verificação.
- Nomes de autores legislativos e documentos oficiais são dados públicos intencionais. Isso não autoriza a inclusão de contatos pessoais, perfis de cidadãos ou documentos privados.
- Resumos por IA podem conter erros. A fonte original e a revisão humana são parte essencial da segurança da informação.
- `.env.example` contém apenas nomes de variáveis, com valores vazios. O `.env` real nunca deve ser enviado ao repositório, e segredos não usam prefixo `PUBLIC_` nem vão ao navegador.

## Dependências

Rode `pnpm audit` regularmente. A CI (`.github/workflows/ci.yml`) falha com alertas de severidade moderada ou superior; alertas de severidade baixa são registrados pelo `pnpm audit`, mas não bloqueiam a CI.
