// Progressive enhancement for the deputies list. Without JavaScript every
// deputy in office stays listed; with it, the mandate filter (current, any
// legislature since 1826, or everyone), name search and party/UF filters
// apply, starting from ?uf=, ?nome= and ?mandato= when present. Former
// deputies come from deputados-mandatos.json, fetched only the first time
// another mandate is chosen.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const filters = $("[data-filters]");
  const mandate = $("#mandato");
  const name = $("#busca-deputado");
  const party = $("#partido");
  const state = $("#uf");
  const list = $(".rows");
  const count = $("[data-count]");
  const empty = $("[data-empty]");
  const status = $("[data-status]");
  const more = $("[data-more]");
  const PAGE = 40;
  let cards = [...document.querySelectorAll("[data-deputy]")];
  let archive = null;
  const byName = new Intl.Collator("pt-BR").compare;
  let limit = PAGE;
  const clean = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  // Old records come in capitals: show them as names, keeping particles in
  // lowercase. Only the displayed text changes; search uses deputy.name.
  const PARTICLES = new Set(["de", "da", "do", "dos", "das", "e"]);
  const displayName = (name) => {
    if (/\p{Ll}/u.test(name)) return name;
    return name
      .toLocaleLowerCase("pt-BR")
      .split(" ")
      .map((word, i) =>
        i && PARTICLES.has(word)
          ? word
          : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1),
      )
      .join(" ");
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  // "2019–2023" from the first to the last legislature the deputy served.
  const years = (mandates) => {
    const dates = mandates.map((m) =>
      archive.legislatures.find((l) => l.id === m.legislature),
    );
    const from = Math.min(...dates.map((l) => Number(l.start.slice(0, 4))));
    const to = Math.max(
      ...dates.map((l) => Number((l.end ?? l.start).slice(0, 4))),
    );
    return from === to ? `${from}` : `${from}–${to}`;
  };

  // Former deputies have no profile page here: the row links to the
  // Câmara's own page. Photos are only kept for deputies in office.
  function card(deputy) {
    const latest = deputy.mandates[0];
    const item = element("li", "row tap");
    item.dataset.deputy = "";
    item.dataset.search = clean(deputy.name);
    item.dataset.party = latest.parties[0] ?? "";
    item.dataset.state = deputy.state ?? "";
    item.dataset.legislatures = deputy.mandates
      .map((m) => m.legislature)
      .join(" ");
    item.dataset.parties = `|${deputy.mandates
      .flatMap((m) => m.parties.map((p) => `${m.legislature}:${p}`))
      .join("|")}|`;
    const photo = element("span", "avatar no-photo", "◉");
    photo.setAttribute("aria-hidden", "true");
    const main = element("div", "row-main");
    const link = element("a", "row-title clamp-2", displayName(deputy.name));
    link.href = `https://www.camara.leg.br/deputados/${deputy.id}`;
    link.rel = "noopener";
    main.append(
      link,
      element(
        "p",
        "row-meta clamp-1",
        [
          years(deputy.mandates),
          deputy.state,
          latest.parties.join("/") || "Sem partido",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    // The link leaves the site, so the row shows ↗ instead of a chevron.
    const outside = element("span", "external", "↗");
    outside.setAttribute("aria-hidden", "true");
    item.append(photo, main, outside);
    return item;
  }

  async function loadHistory() {
    if (archive) return true;
    status.hidden = false;
    status.textContent = "Carregando deputados de legislaturas anteriores…";
    try {
      const response = await fetch(filters.dataset.history);
      if (!response.ok) throw new Error(String(response.status));
      archive = await response.json();
    } catch {
      status.textContent =
        "Não foi possível carregar o histórico de mandatos. Tente de novo.";
      return false;
    }
    status.hidden = true;
    const current = new Set(
      cards.map((c) => c.querySelector("a").pathname.match(/(\d+)\/?$/)?.[1]),
    );
    const former = archive.deputies
      .filter((d) => !current.has(String(d.id)))
      .map(card);
    const title = (c) => c.querySelector(".row-title").textContent;
    cards = [...cards, ...former].sort((a, b) => byName(title(a), title(b)));
    list.append(...cards);
    return true;
  }

  const mode = () => mandate.value;
  const inMode = (c) =>
    mode() === "atual"
      ? "current" in c.dataset
      : mode() === "todos" ||
        c.dataset.legislatures.split(" ").includes(mode());
  const partyOf = (c) => {
    if (mode() === "atual") return c.dataset.party ? [c.dataset.party] : [];
    const prefix = mode() === "todos" ? "" : `${mode()}:`;
    return c.dataset.parties
      .split("|")
      .filter((entry) => entry && entry.startsWith(prefix))
      .map((entry) => entry.slice(entry.indexOf(":") + 1));
  };

  // Party and state options follow the chosen mandate: in a legislature,
  // its parties; for everyone, historical ones such as ARENA or GB too.
  function rebuild(select, label, values) {
    const chosen = select.value;
    select.replaceChildren(
      new Option(label, ""),
      ...[...values].sort().map((v) => new Option(v, v)),
    );
    select.value = values.has(chosen) ? chosen : "";
  }
  function options() {
    const parties = new Set();
    const states = new Set();
    for (const c of cards) {
      if (!inMode(c)) continue;
      for (const p of partyOf(c)) parties.add(p);
      if (c.dataset.state) states.add(c.dataset.state);
    }
    rebuild(party, "Partido", parties);
    rebuild(state, "Estado", states);
  }

  function update() {
    const query = clean(name.value);
    let shown = 0;
    let matched = 0;
    for (const c of cards) {
      const match =
        inMode(c) &&
        c.dataset.search.includes(query) &&
        (!party.value || partyOf(c).includes(party.value)) &&
        (!state.value || c.dataset.state === state.value);
      if (match) matched++;
      const visible = match && shown < limit;
      if (visible) shown++;
      c.hidden = !visible;
    }
    const where =
      mode() === "atual"
        ? "em exercício"
        : mode() === "todos"
          ? "desde 1826"
          : `na ${mode()}ª legislatura`;
    count.textContent = `${matched.toLocaleString("pt-BR")} ${matched === 1 ? "deputado" : "deputados"} ${where}`;
    empty.hidden = matched > 0;
    more.hidden = matched <= shown;
    more.textContent = `Mostrar mais (${(matched - shown).toLocaleString("pt-BR")} restantes)`;
  }

  async function changeMandate() {
    if (mode() !== "atual" && !(await loadHistory())) mandate.value = "atual";
    const url = new URL(location.href);
    if (mode() === "atual") url.searchParams.delete("mandato");
    else url.searchParams.set("mandato", mode());
    window.history.replaceState(null, "", url);
    limit = PAGE;
    options();
    update();
  }

  const reset = () => {
    limit = PAGE;
    update();
  };
  filters.hidden = false;
  name.addEventListener("input", reset);
  for (const select of [party, state]) select.addEventListener("change", reset);
  mandate.addEventListener("change", changeMandate);
  more.addEventListener("click", () => {
    limit += PAGE;
    update();
  });
  // The homepage's "Quem é o meu deputado?" form links here with ?uf=.
  const params = new URLSearchParams(location.search);
  const uf = params.get("uf");
  if (uf && [...state.options].some((o) => o.value === uf)) state.value = uf;
  name.value = params.get("nome") ?? name.value;
  const initial = params.get("mandato");
  if (initial && [...mandate.options].some((o) => o.value === initial)) {
    mandate.value = initial;
    changeMandate();
  } else update();
})();
