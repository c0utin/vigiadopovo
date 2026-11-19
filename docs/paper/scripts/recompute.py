"""Recomputes the alignment metric (Equation 1) from the Chamber's yearly files
and compares it, row by row, with the site's API. Standard library only; shares
no code with the project. Usage: python3 -I recompute.py 2011 2019 2023 2026
"""

import collections, hashlib, json, sys, urllib.parse, urllib.request

SITE = "https://vigiadopovo.rafaelcouto111.workers.dev"
FILES = "https://dadosabertos.camara.leg.br/arquivos/{0}/json/{0}-{1}.json"
V = {"Sim", "Não", "Abstenção", "Obstrução"}
BLOCS = {"GOV.": "Governo", "GOVERNO": "Governo", "OPOSIÇÃO": "Oposição",
         "MAIORIA": "Maioria", "MINORIA": "Minoria"}


def get(url):
    # Cloudflare rejects urllib's default User-Agent.
    request = urllib.request.Request(url, headers={"User-Agent": "recompute.py"})
    with urllib.request.urlopen(request, timeout=600) as response:
        return response.read()


def check(year):
    sources = {f["arquivo"]: f["sha256"] for f in
               json.loads(get(f"{SITE}/api/metricas/fontes?ano={year}"))["linhas"]}
    data = {}
    for name in ("votacoesVotos", "votacoesOrientacoes"):
        body = get(FILES.format(name, year))
        same = hashlib.sha256(body).hexdigest() == sources[f"{name}-{year}.json"]
        print(f"{year} {name}: digest {'equal' if same else 'DIFFERENT'}")
        data[name] = json.loads(body)["dados"]
    # One Sim/Não orientation per voting and leadership; Equation 1 assumes it.
    oriented = {}
    for o in data["votacoesOrientacoes"]:
        bloc = BLOCS.get((o.get("siglaBancada") or "").upper())
        if bloc and o.get("orientacao") in ("Sim", "Não"):
            key = (o["idVotacao"], bloc)
            assert key not in oriented, f"two orientations for {key}"
            oriented[key] = o["orientacao"]
    counts = collections.defaultdict(lambda: [0, 0])
    for v in data["votacoesVotos"]:
        if v.get("voto") not in V:
            continue
        party = (v.get("deputado_") or {}).get("siglaPartido")
        for bloc in set(BLOCS.values()):
            orientation = oriented.get((v["idVotacao"], bloc))
            if orientation:
                row = counts[(bloc, party)]
                row[0] += 1
                row[1] += v["voto"] == orientation
    rows = differ = 0
    for bloc in sorted(set(BLOCS.values())):
        q = urllib.parse.quote(bloc)
        published = {r["partido"]: [r["votos"], r["alinhados"]] for r in json.loads(
            get(f"{SITE}/api/metricas/alinhamento?ano={year}&bancada={q}"))["linhas"]}
        mine = {p: c for (b, p), c in counts.items() if b == bloc}
        for party in published.keys() | mine.keys():
            rows += 1
            if published.get(party) != mine.get(party):
                differ += 1
                print(f"  {bloc} {party}: site {published.get(party)} here {mine.get(party)}")
    print(f"{year}: {len(data['votacoesVotos'])} vote records, {rows} rows, {differ} differ")
    return differ


if __name__ == "__main__":
    sys.exit(1 if sum(check(int(y)) for y in sys.argv[1:]) else 0)
