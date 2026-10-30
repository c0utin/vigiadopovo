# Como contribuir

O Vigia do Povo é uma iniciativa independente de transparência legislativa. Contribuições devem preservar a neutralidade, a rastreabilidade e a linguagem acessível.

## Desenvolvimento

Use Node.js 22.17 ou superior e pnpm 12. Instale com `pnpm install --frozen-lockfile`, faça alterações pequenas e execute antes de abrir um pull request:

```sh
pnpm format:check
pnpm test
pnpm check
pnpm build
```

Use `pnpm format` para formatar os arquivos. Evite dependências e abstrações que não sejam necessárias. Mudanças visuais devem ser conferidas no navegador em larguras amplas e estreitas; alterações no pipeline devem preservar os testes de fonte, atualização e falha de rede.

### Pipeline em TypeScript e Effect v4

- Preserve as transformações puras de dados e contextos; mantenha rede, arquivos e armazenamento nas bordas.
- Use `Schema` para entradas externas, `Effect.fn` para operações rastreáveis e serviços com `Layer` para dependências substituíveis. Não acrescente outra biblioteca de validação ou wrappers sem necessidade.
- Trate falhas esperadas no canal de erro com mensagens seguras. Não registre configurações completas, cabeçalhos ou corpos privados de provedores. Respeite cancelamento e libere recursos com escopo.
- Consulte os exemplos e tipos da versão instalada do Effect; APIs da v3 não são intercambiáveis com a v4. Use nomes do domínio, módulos pequenos por responsabilidade e comentários que expliquem decisões, não cada linha.
- Os testes devem validar resultados observáveis e falhas, sem depender de credenciais ou serviços pagos. `pnpm check` inclui a verificação estrita de tipos da pipeline.

## Dados e resumos

- Use apenas fontes oficiais. Não inclua notícias, posições partidárias ou conteúdo inventado como evidência.
- Separe ementa oficial, explicação por IA e revisão humana. Nunca declare uma revisão que não aconteceu.
- Resumos atuais cobrem somente a ementa. Não extrapole impactos, custos, sanção, vigência ou resultado de votação.
- Ao corrigir um resumo, informe o número da proposta, o link oficial e o trecho que fundamenta a mudança. Preserve o hash correspondente à fonte e registre a data real da geração.
- Não publique CPF, contatos pessoais, documentos privados, segredos, arquivos de ambiente ou capturas com informações sensíveis.
- Não altere manualmente os arquivos de saída para simular coleta ou aprovação. Consulte o fluxo em [README.md](README.md).

## Pull requests

Explique o problema, a alteração e como ela foi verificada. Não faça refatorações não relacionadas. Para vulnerabilidades ou exposição de credenciais, siga [SECURITY.md](SECURITY.md), em vez de abrir uma issue pública com os detalhes.

## Licença

O código e as contribuições de software são disponibilizados sob [MIT](LICENSE). Os documentos e dados legislativos mantêm sua origem e seu regime jurídico; a licença do código não atribui propriedade sobre documentos oficiais ou conteúdo de terceiros.
