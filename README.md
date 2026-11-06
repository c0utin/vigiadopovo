<p align="center">
  <img src="docs/readme/banner.jpg" alt="vigia do povo: transparência legislativa independente e aberta" width="100%">
</p>

<p align="center">
  <a href="LICENSE.md"><img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-d9f178?style=flat-square&labelColor=173e34"></a>
  <img alt="Dados oficiais da Câmara" src="https://img.shields.io/badge/dados-oficiais%20da%20C%C3%A2mara-f2efdf?style=flat-square&labelColor=173e34">
  <img alt="Atestado com Sigstore" src="https://img.shields.io/badge/coleta-atestada%20(Sigstore)-f2efdf?style=flat-square&labelColor=173e34">
  <img alt="Carimbo no Bitcoin" src="https://img.shields.io/badge/carimbo-OpenTimestamps-f2efdf?style=flat-square&labelColor=173e34">
</p>

<p align="center">
  <a href="https://vigiadopovo.rafaelcouto111.workers.dev"><b>Abrir o site</b></a> ·
  <a href="#como-verificar">Como verificar</a> ·
  <a href="docs/tecnico.md">Documentação técnica</a> ·
  <a href="CONTRIBUTING.md">Contribuir</a>
</p>

O **Vigia do Povo** mostra o que a Câmara dos Deputados vota, quem votou e como, em linguagem simples, a partir só de dados oficiais. Cada número do site pode ser recalculado e conferido por qualquer pessoa.

## Por que existe

Os dados da Câmara são públicos, mas estão espalhados em arquivos enormes e APIs que pouca gente consegue ler. Quem resume esses dados costuma ter um lado. O Vigia do Povo existe para que qualquer cidadão veja **o que aconteceu de fato**, sem opinião no meio, e para que ninguém precise acreditar no projeto: **a prova vem junto com o número.**

## Independente e aberto

- **Sem vínculo** com a Câmara, partidos, governos ou empresas, e sem anúncios.
- **Código aberto** sob licença [MIT](LICENSE.md): qualquer pessoa pode ler, copiar, rodar e auditar.
- **Só fontes oficiais.** Nada é digitado à mão e nenhuma IA gera números; resumos de ementa feitos por IA são marcados e nunca substituem o texto oficial.
- **Verificável.** Cada coleta tem hash, assinatura pública e carimbo no Bitcoin; cada métrica tem fórmula pública.
- **Custo zero.** Roda na franquia grátis do GitHub e da Cloudflare, com trava automática antes do limite.

## O que tem no site

|                      |                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------- |
| 📜 **Propostas**     | Projetos de lei recentes, com a ementa oficial explicada em linguagem simples.           |
| 🗳️ **Votos**         | Cada voto registrado, com filtros por tema, partido, UF, deputado e posição.             |
| 👤 **Deputados**     | Quem está em exercício e quem já exerceu mandato, com filtro por legislatura desde 1826. |
| 📊 **Métricas**      | Alinhamento com Governo e Oposição, votações por mês e votos por deputado, desde 2003.   |
| 🔍 **Transparência** | A coleta que gerou cada número, com hashes e links das provas.                           |
| 🤖 **Para IA**       | Link em texto simples (`/llms.txt`, `.md`) para colar no ChatGPT, Claude ou Gemini.      |

## Por que dá para confiar

| Pergunta                                 | Prova pública                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| O dado mudou depois da coleta?           | SHA-256 de cada arquivo no manifesto da coleta.                                               |
| Quem gerou o arquivo?                    | Atestação Sigstore do workflow público, ligada ao commit e à execução.                        |
| Quando foi coletado?                     | Hash do manifesto carimbado num bloco do Bitcoin (OpenTimestamps).                            |
| A métrica está certa?                    | Fórmula pública ([`lake/src/ouro.rs`](lake/src/ouro.rs)), recalculável dos arquivos oficiais. |
| O site publicado é o que foi verificado? | `SHA256SUMS` com o hash de cada arquivo do site, atestado em cada deploy.                     |

<details>
<summary><b>Mostrar o pipeline de dados</b></summary>

<p align="center">
  <img src="docs/readme/pipeline.svg" alt="Animação do pipeline: Câmara, coleta por código aberto, SHA-256, assinatura e carimbo, cálculo por regras fixas, verificação" width="100%">
</p>

1. **Coleta** (GitHub Actions, todo dia às 06:00 de Brasília): baixa a API e os arquivos oficiais da Câmara, testa, gera o manifesto com o SHA-256 de tudo, assina (Sigstore) e carimba (OpenTimestamps).
2. **Lake** (Rust + Polars, Iceberg no Cloudflare R2), em arquitetura medalhão e **só com acréscimos**:
   - **bronze:** cada versão de cada arquivo oficial, exatamente como publicada, guardada pelo seu SHA-256, com a lista de campos que a API publicou;
   - **prata:** cada registro com todas as suas versões (SCD tipo 2): novo, alterado ou removido, nunca sobrescrito;
   - **ouro:** as métricas, cada uma ligada ao lote de arquivos de que saiu.
3. **Publicação:** o lake grava, por ano, um JSON com as linhas de ouro e as fontes do lote; um job envia esses arquivos ao R2. O site é estático (Cloudflare Workers); fotos são assets estáticos e as métricas são servidas do R2 com cache (Cache API). Visitantes nunca disparam consultas.

| Peça     | Onde                                          | Custo                             |
| -------- | --------------------------------------------- | --------------------------------- |
| Coleta   | GitHub Actions                                | grátis                            |
| Site     | Cloudflare Workers (páginas pré-renderizadas) | plano grátis                      |
| Fotos    | Cloudflare Workers (assets estáticos)         | grátis                            |
| Métricas | JSON no R2, gerado a partir do lake Iceberg   | franquia grátis, com trava em 80% |

Detalhes, limites e configuração em [docs/tecnico.md](docs/tecnico.md).

</details>

<details>
<summary><b>Mostrar a matemática</b></summary>

**Integridade (SHA-256).** O manifesto $M$ lista o hash $H(x)$ de cada artefato. Verificar é recalcular: $\text{válido}(x) \iff H(x) = h_x$. Forjar outro arquivo com o mesmo hash que um dado exige cerca de $2^{256}$ operações (segunda pré-imagem); achar quaisquer dois arquivos com o mesmo hash custaria cerca de $2^{128}$, mas isso não permite trocar um arquivo já publicado. Mudar um byte muda o hash inteiro.

**Origem (Sigstore).** O GitHub assina $H(\text{arquivo})$ com a identidade do workflow, do commit e da execução, num log público (Rekor). Prova **qual código** gerou o arquivo, não que a Câmara está certa.

**Tempo (OpenTimestamps).** O hash entra numa árvore de Merkle cuja raiz vai para uma transação do Bitcoin; a prova `.ots` é o caminho $h \to \dots \to \text{raiz}$.

**Alinhamento** do partido $p$ com a bancada $b$ no ano $a$, só em votações em que $b$ orientou Sim ou Não, com $V$ = Sim, Não, Abstenção ou Obstrução:

$$
\text{alinhamento}(p,b,a) = \frac{\left\lvert \lbrace v : \text{partido}(v)=p,\ \text{voto}(v)=\text{orientação}_b(v) \rbrace \right\rvert}{\left\lvert \lbrace v : \text{partido}(v)=p,\ \text{voto}(v) \in V \rbrace \right\rvert}
$$

O partido é o registrado em cada voto. Ausência nunca conta como voto, e coincidir com uma orientação não significa apoiar o mérito.

**Percentil do radar** entre os $n$ deputados em exercício (empates na posição média):

$$
P(x) = \operatorname{round}\left(100 \cdot \frac{\left\lvert \lbrace y : y < x \rbrace \right\rvert + \tfrac{1}{2} \left\lvert \lbrace y : y = x \rbrace \right\rvert}{n}\right)
$$

**O que isso não prova:** a API da Câmara não assina suas respostas, e é preciso confiar nos runners do GitHub (qualquer fork pode rodar o mesmo workflow como testemunha). Registros inconsistentes da fonte ficam de fora e são contados, nunca adivinhados.

</details>

<details id="como-verificar">
<summary><b>Mostrar como verificar</b></summary>

**1. Recalcule uma métrica sem usar nada deste projeto**, com qualquer ferramenta SQL que leia JSON (aqui, [DuckDB](https://duckdb.org)), direto nos arquivos oficiais:

```sql
WITH votos AS (
  SELECT unnest(dados, recursive := true)
  FROM read_json('https://dadosabertos.camara.leg.br/arquivos/votacoesVotos/json/votacoesVotos-2019.json', maximum_object_size = 500000000)
), orientacoes AS (
  SELECT unnest(dados, recursive := true)
  FROM read_json('https://dadosabertos.camara.leg.br/arquivos/votacoesOrientacoes/json/votacoesOrientacoes-2019.json', maximum_object_size = 500000000)
)
SELECT v.siglaPartido AS partido, count(*) AS votos,
       count(*) FILTER (WHERE v.voto = o.orientacao) AS alinhados
FROM votos v JOIN orientacoes o ON o.idVotacao = v.idVotacao
WHERE upper(o.siglaBancada) IN ('GOV.', 'GOVERNO')   -- a Câmara usou "GOV." até 2022
  AND o.orientacao IN ('Sim', 'Não')
  AND v.voto IN ('Sim', 'Não', 'Abstenção', 'Obstrução')
GROUP BY partido ORDER BY votos DESC LIMIT 3;
```

```sh
curl -s "https://vigiadopovo.rafaelcouto111.workers.dev/api/metricas/alinhamento?ano=2019&bancada=Governo" | jq '.linhas[:3]'
```

Os dois dão **PSL 10.793 / 10.530**, **PT 9.214 / 1.955** e **PSD 6.814 / 6.146**.

**2. Confira um arquivo do site e a coleta que o gerou** (conferência de atestações, hashes e carimbo OpenTimestamps): o passo a passo, com a saída esperada de cada verificação, está em [VERIFY.md](VERIFY.md).

</details>

## Licença

Código sob [licença MIT](LICENSE.md). Dados e documentos legislativos são da Câmara dos Deputados e mantêm seu regime jurídico; fotos oficiais: Câmara dos Deputados. Veja [como contribuir](CONTRIBUTING.md) e a [política de segurança](SECURITY.md).

## Executar

Setup local, comandos de dados, lake e configuração da Cloudflare estão em [docs/tecnico.md](docs/tecnico.md#executar).
