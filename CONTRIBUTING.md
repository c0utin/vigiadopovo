# Como contribuir

O Vigia do Povo é uma iniciativa independente de transparência legislativa. Contribuições devem preservar a neutralidade, a rastreabilidade e a linguagem acessível.

## Desenvolvimento

Instale e rode o projeto como descrito em [Executar](docs/tecnico.md#executar). Antes de abrir um pull request, execute `pnpm format:check`, `pnpm test`, `pnpm check` e `pnpm build`. Use `pnpm format` para formatar os arquivos.

Evite dependências e abstrações que não sejam necessárias. Mudanças visuais devem ser conferidas no navegador em larguras amplas e estreitas. Mudanças no pipeline devem manter os testes de fonte, atualização e falha de rede.

## Effect e TypeScript

- Effect é obrigatório onde for possível: os scripts `scripts/*.ts` (`sync`, `deputies`, `check-performance`, `metrics`, `budget`), o pipeline em `scripts/pipeline/` e o Worker em `worker/`. Cada script é um programa Effect executado com `NodeRuntime.runMain` (`@effect/platform-node`).
- Scripts do navegador e loaders de pré-renderização são exceções: ficam em JavaScript simples para caber nos orçamentos de `docs/tecnico.md#desempenho`.
- Não há código legado nem dívida técnica aceitos: ao substituir uma implementação, remova a antiga no mesmo pull request. Não mantenha adaptadores de compatibilidade, wrappers desnecessários nem entradas antigas.
- Em TypeScript, grave arquivos publicados com `writeAtomic` (`scripts/pipeline/files.ts`), não com escrita direta.
- Mantenha as transformações de dados puras; rede, arquivos e armazenamento ficam nas bordas.
- Use `Schema` para entradas externas, `Effect.fn` para operações rastreáveis e `Layer` para dependências substituíveis. Não acrescente outra biblioteca de validação nem wrappers sem necessidade.
- Erros esperados vão no canal de erro, com mensagens seguras. Não registre cabeçalhos, corpos de resposta privados nem configurações completas. Respeite cancelamento e libere recursos com escopo.
- Consulte os exemplos e tipos da versão instalada do Effect: APIs da v3 não são intercambiáveis com a v4. Use nomes do domínio, módulos pequenos por responsabilidade e comentários que expliquem decisões, não cada linha.
- Os testes validam resultados observáveis e falhas, sem depender de credenciais ou serviços pagos. `pnpm check` inclui a verificação estrita de tipos da pipeline.

## Dados e resumos

- Use apenas fontes oficiais. Não inclua notícias, posições partidárias ou conteúdo inventado como evidência.
- Separe ementa oficial, resumo por IA e revisão humana. Nunca declare uma revisão que não aconteceu.
- Resumos cobrem somente a ementa. Não extrapole impactos, custos, sanção, vigência ou resultado de votação.
- Ao corrigir um resumo, informe o número da proposta, o link oficial e o trecho que fundamenta a mudança. Preserve o hash correspondente à fonte e registre a data real da geração.
- Não publique CPF, contatos pessoais, documentos privados, segredos, arquivos de ambiente ou capturas com informações sensíveis.
- Não altere manualmente os arquivos de saída para simular coleta ou aprovação. O fluxo de coleta e publicação está em [docs/tecnico.md](docs/tecnico.md).

## Pull requests

Explique o problema, a alteração e como ela foi verificada. Não faça refatorações não relacionadas. Para vulnerabilidades ou exposição de credenciais, siga [SECURITY.md](SECURITY.md) em vez de abrir uma issue pública com os detalhes.

## Licença

Contribuições de software são publicadas sob a [licença MIT](LICENSE.md). Documentos e dados legislativos mantêm sua origem e seu regime jurídico; veja [Licença no README](README.md#licença).
