# Artigo (arXiv)

Fonte LaTeX do artigo "Check It Yourself: Verifiable Legislative Transparency in Simple Language for Brazil's Chamber of Deputies".

```sh
cd docs/paper
latexmk -pdf main.tex   # ou: pdflatex, bibtex, pdflatex, pdflatex
```

- `main.tex` e `sections/`: texto.
- `references.bib`: referências conferidas em 16/11/2026.
- `data/`: números dos gráficos e da tabela anual, lidos de `/api/metricas` em 16/11/2026.
- `main.bbl`: bibliografia já processada, exigida pelo arXiv no envio da fonte.
