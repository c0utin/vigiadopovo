#!/usr/bin/env bash
# Builds the arXiv upload: arxiv/ (the files to upload) and arxiv.tar.gz.
# Regenerates main.bbl, copies only what main.tex needs, strips TeX comments,
# and compiles the copy without references.bib, as arXiv does.
set -euo pipefail
cd "$(dirname "$0")"

latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex >/dev/null
latexmk -c main.tex >/dev/null

rm -rf arxiv arxiv.tar.gz
mkdir -p arxiv/sections arxiv/data
for f in main.tex sections/*.tex data/yeartable.tex; do
  # Drop full-line comments and trailing comments; keep escaped \%.
  perl -ne 'next if /^\s*%/; s/(?<!\\)%.*$/%/; print' "$f" >"arxiv/$f"
done
cp main.bbl arxiv/
cp data/alignment.dat arxiv/data/

# arXiv compiles with pdflatex and the shipped .bbl, without running bibtex.
build=$(mktemp -d)
cp -r arxiv/. "$build"
(cd "$build" && pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null &&
  pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null &&
  pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null)
if grep -E 'undefined|Rerun to get|File .* not found' "$build/main.log"; then
  echo "arXiv test build has problems; see $build/main.log" >&2
  exit 1
fi
cp "$build/main.pdf" arxiv-preview.pdf
rm -rf "$build"

tar -czf arxiv.tar.gz -C arxiv .
echo "Upload arxiv.tar.gz (or the files in arxiv/). Preview: arxiv-preview.pdf"
tar -tzf arxiv.tar.gz
