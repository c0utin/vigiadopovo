#!/usr/bin/env bash
# Validates, builds and deploys main to Cloudflare from an Amp orb.
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"

# Only published code is deployed: a clean tree at main on both the Amp
# remote (origin) and GitHub (github), where the daily collection commits.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ship: commit or stash your changes first" >&2
  exit 1
fi
for remote in origin github; do
  git fetch --quiet "$remote" main
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$remote/main")" ]]; then
    echo "ship: HEAD is not $remote/main; merge and push first" >&2
    exit 1
  fi
done

pnpm install --frozen-lockfile
pnpm format:check
pnpm test
pnpm check
pnpm audit --audit-level moderate
# Deputy profiles are not versioned; each deploy collects them. Photos are
# versioned in static/fotos, so only new deputies' photos download.
pnpm data:deputies
pnpm build
pnpm perf:check
# One checksum list covers every published file, photos included.
(cd build && find . -type f ! -name SHA256SUMS -printf '%P\0' | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
pnpm exec wrangler deploy

if [[ -n "$(git status --porcelain -- static/fotos)" ]]; then
  echo "ship: deputy photos changed; commit static/fotos/deputados"
fi
