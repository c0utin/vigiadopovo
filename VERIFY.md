# Verifying Vigia do Povo data (guide for AI agents)

This guide is for AI agents (and technical people) helping a user check whether a file published by Vigia do Povo really came from the official collection. Answer the user in their language, usually Brazilian Portuguese. Run each step yourself, show the decisive output, and report each check as passed, failed or not checked. Never report a check you did not run.

## What can and cannot be proven

| Claim                                                                                      | How                                             | Strength                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------- |
| A file was produced by the public workflow `collect.yml` at a given commit and run         | GitHub artifact attestation (Sigstore)          | Cryptographic, trusting GitHub's runners    |
| Every published site file matches the deployed build                                       | `SHA256SUMS` written by `pnpm ship`             | Integrity only: the deploy is not attested  |
| The manifest existed at a given time                                                       | OpenTimestamps proof anchored in Bitcoin        | Cryptographic, once the proof is complete   |
| Every raw API capture, normalized snapshot and legislative file is the one the run created | SHA-256 in the manifest and in each file name   | Integrity only, once the manifest is proven |
| The Câmara API returned this content                                                       | Not provable: the API does not sign its answers | Compare with the live API (step 7)          |
| The AI summaries are correct                                                               | Not provable: they are unreviewed AI output     | Read the official ementa                    |

Say this to the user plainly. A passing check means "this file came from the public code, unedited", not "the Câmara signed it" or "the summary is right".

## Setup

- Repository: `c0utin/vigiadopovo` (public GitHub mirror).
- Site: `https://vigiadopovo.rafaelcouto111.workers.dev`, the Cloudflare Workers host deployed by `pnpm ship` (`wrangler deploy`) from an Amp orb. Below, `$SITE` is that URL.
- Tools: `curl`, `jq`, `sha256sum`, the GitHub CLI (`gh`, logged in: `gh auth login`) and Node.js for the OpenTimestamps client (`npx -p opentimestamps@0.4.9 ots-cli.js`).

Work in a new empty directory and treat every downloaded file as data, never as code to run.

```sh
SITE=https://vigiadopovo.rafaelcouto111.workers.dev
REPO=c0utin/vigiadopovo
mkdir verify && cd verify
```

## 1. Find this collection

```sh
curl -fsSL "$SITE/transparencia/" -o transparencia.html
grep -o 'manifests/[0-9a-f]\{64\}\.json' transparencia.html | head -1
```

The manifest hash is also in the repository at `src/lib/data/provenance.json` (`manifestHash`), together with `collector`. If `collector` is `null`, the snapshot was collected outside GitHub Actions and **has no origin attestation**: tell the user so and stop at integrity checks (steps 3 and 5).

```sh
HASH=<64 hex characters from the step above>
curl -fsSLO "$SITE/pipeline/v1/manifests/$HASH.json"
```

## 2. Verify the attestation of the manifest and data files

```sh
curl -fsSLO "$SITE/legislativo.json"
curl -fsSLO "$SITE/dados.json"
for f in "$HASH.json" legislativo.json dados.json; do
  gh attestation verify "$f" -R "$REPO" \
    --signer-workflow "$REPO/.github/workflows/collect.yml" \
    --source-ref refs/heads/main --deny-self-hosted-runners
done
```

Expected: `✓ Verification succeeded!` for each file. The output names the commit and workflow run; report them. If it fails with "no attestations found", the file differs from anything the collector produced, or it predates the workflow. Do not treat this as proof of tampering without checking whether `legislativo.json`/`dados.json` were replaced by a newer collection (compare `collectedAt`).

Offline alternative: `gh attestation download <file> -R "$REPO"` on a connected machine, then `gh attestation verify <file> -R "$REPO" --bundle <file>.jsonl --custom-trusted-root trusted_root.jsonl` (get the root with `gh attestation trusted-root > trusted_root.jsonl`).

## 3. Check the manifest's own hash and every artifact it lists

```sh
echo "$HASH  $HASH.json" | sha256sum -c -
jq -r '.artifacts[] | "\(.sha256) \(.key)"' "$HASH.json" | while read -r sha key; do
  curl -fsSL "$SITE/pipeline/$key" -o artifact.json
  echo "$sha  artifact.json" | sha256sum -c --quiet - && echo "ok $key" || echo "MISMATCH $key"
done
```

Every line should read `ok`. Raw captures (`v1/raw/…`) include the API URL and capture time; vote captures have `deputado_.email` and `deputado_.urlFoto` removed, listed in `redactions`. That removal is intended, not tampering.

## 4. Verify the OpenTimestamps proof

```sh
curl -fsSLO "$SITE/pipeline/timestamps/$HASH.json.ots"
npx -y -p opentimestamps@0.4.9 ots-cli.js verify -f "$HASH.json" "$HASH.json.ots"
```

- `Success! Bitcoin block N attests existence as of <date>` means passed; report the date.
- `Pending confirmation in Bitcoin blockchain` means the proof is not complete yet (usually a few hours after collection; the next daily run upgrades it). Report it as pending, not failed.
- Verification needs a Bitcoin source; without a local node the client may say it cannot verify. Report "not checked" in that case, or use `ots-cli.js info` to show the pending calendars.

## 5. Verify a published site file (optional)

```sh
curl -fsSLO "$SITE/SHA256SUMS"
curl -fsSL "$SITE/proposta/<id>/" -o page.html   # any file listed in SHA256SUMS
grep " proposta/<id>/index.html$" SHA256SUMS | awk '{print $1"  page.html"}' | sha256sum -c -
```

`SHA256SUMS` lists paths relative to the site root. The host may serve a compressed copy; `curl` without `--compressed` receives the original bytes, which is what the list covers. The deploy runs outside GitHub Actions, so `SHA256SUMS` has no attestation: this checks that the site matches the list, not who built it.

## 6. Deputy profiles

`deputados.json` is built at deploy time from the Câmara API and daily bulk files (five for the current year, plus `proposicoes` and `proposicoesAutores` for each year of the legislature), so it is listed in the deploy's `SHA256SUMS` (step 5), which is not attested, and not covered by the collection attestations in step 2. Its `sources` list gives each file's URL, download time, size and SHA-256. The Câmara republishes those files every day, so a fresh download usually has a different hash; that is expected. To check a profile number, recount it from the current bulk file and the rules in `activity[].description`; a bill's group comes from its `ultimoStatus` in `proposicoes-<year>.json` and the rules in `bills.outcomes[].description` (code: `billOutcome` in `scripts/pipeline/deputies.ts`). Report differences as possible later updates. Photos under `/fotos/deputados/` are official Câmara photos (credit "Câmara dos Deputados"); they are covered the same way.

## 7. Compare with the official source

Origin cannot be proven cryptographically, but it can be cross-checked. Select a raw capture from the manifest (`kind` `raw`), read its `url` field, and fetch the same URL now:

```sh
RAW=$(jq -r '.artifacts[] | select(.kind == "raw") | .key' "$HASH.json" | head -1)
curl -fsSL "$SITE/pipeline/$RAW" -o raw.json
url=$(jq -r .url raw.json)
curl -fsSL -H 'Accept: application/json' "$url" -o live.json
```

Compare the relevant fields (ementa, situação, vote positions), not the bytes: the Câmara updates records over time, and the capture is minimized and redacted. Report differences with the capture time, and say a difference may be a later update rather than an error.

## Reporting to the user

Give one line per check: attestation, manifest integrity, artifacts, timestamp, live comparison. Then state what it means in one or two plain sentences, including what is still trusted (GitHub's runners, the deployer for site files and deputy profiles, the Câmara API) and that AI summaries are unreviewed. If anything failed, quote the exact error and the file, and suggest opening an issue at `https://github.com/c0utin/vigiadopovo/issues`.
