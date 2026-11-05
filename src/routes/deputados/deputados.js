// Progressive enhancement for the deputies list. Without JavaScript every
// deputy in office stays listed; with it, the mandate filter (current, any
// legislature since 1826, or everyone), name search and party/UF filters
// apply. Former deputies come from deputados-mandatos.json, fetched only the
// first time another mandate is chosen.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const filters = $("[data-filters]");
  const mandate = $("#mandato");
  const name = $("#busca-deputado");
  const party = $("#partido");
  const state = $("#uf");
  const grid = $(".deputy-grid");
  const count = $("[data-count]");
  const empty = $("[data-empty]");
  const status = $("[data-status]");
  const more = $("[data-more]");
  const PAGE = 120;
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
  const served = (list) =>
    list.length
      ? `Legislaturas: ${list
          .slice(0, 4)
          .map((l) => `${l}ª`)
          .join(", ")}${list.length > 4 ? ` +${list.length - 4}` : ""}`
      : "";
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // Former deputies have no profile page here: the card links to the
  // Câmara's own page. Photos are only kept for deputies in office.
  function card(deputy) {
    const latest = deputy.mandates[0];
    const item = element("li");
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
    const link = element("a");
    link.href = `https://www.camara.leg.br/deputados/${deputy.id}`;
    link.rel = "noopener";
    const photo = element("span", "no-photo", "◉");
    photo.setAttribute("aria-hidden", "true");
    const info = element("span", "info");
    info.append(
      element("strong", "", deputy.name),
      element(
        "span",
        "",
        `${latest.parties.join("/") || "Sem partido registrado"} · ${deputy.state ?? "—"}`,
      ),
      element(
        "span",
        "served",
        served(deputy.mandates.map((m) => m.legislature)),
      ),
      element("span", "tag former", `Ex-deputado · ${latest.legislature}ª`),
    );
    link.append(photo, info);
    item.append(link);
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
    cards = [...cards, ...former].sort((a, b) =>
      byName(
        a.querySelector("strong").textContent,
        b.querySelector("strong").textContent,
      ),
    );
    grid.append(...cards);
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
    rebuild(party, "Todos os partidos", parties);
    rebuild(state, "Todos os estados", states);
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
  const initial = new URLSearchParams(location.search).get("mandato");
  if (initial && [...mandate.options].some((o) => o.value === initial)) {
    mandate.value = initial;
    changeMandate();
  } else update();
})();
