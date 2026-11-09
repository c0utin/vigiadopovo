// Progressive enhancement for the homepage. Without JavaScript every proposal
// stays listed; with it, search and topic chips filter the rows.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const filters = $("[data-filters]");
  const input = $("#busca");
  const rows = [...document.querySelectorAll("[data-search]")];
  const chips = [...document.querySelectorAll("[data-topic-filter]")];
  const count = $("[data-count]");
  const periods = [...document.querySelectorAll("[data-period]")];
  const mores = [...document.querySelectorAll(".more")];
  const empty = $("[data-empty]");
  const clean = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  let topic = "";
  const update = () => {
    const query = clean(input.value);
    const filtering = query !== "" || topic !== "";
    let shown = 0;
    for (const row of rows) {
      const match =
        row.dataset.search.includes(query) &&
        (!topic || row.dataset.topic === topic);
      row.hidden = !match;
      if (match) shown++;
    }
    // A match may sit behind "Ver todos", so filtering opens those lists.
    for (const more of mores) more.open = filtering;
    for (const period of periods) {
      const visible = period.querySelectorAll("[data-search]:not([hidden])");
      period.hidden = !visible.length;
      period.querySelector("[data-period-count]").textContent = visible.length;
    }
    for (const chip of chips)
      chip.setAttribute("aria-pressed", chip.dataset.topicFilter === topic);
    count.textContent = `${shown} ${shown === 1 ? "proposta" : "propostas"}`;
    empty.hidden = shown > 0;
  };
  filters.hidden = false;
  input.addEventListener("input", update);
  for (const chip of chips)
    chip.addEventListener("click", () => {
      topic = chip.dataset.topicFilter;
      update();
    });
  $("[data-clear]").addEventListener("click", () => {
    input.value = "";
    topic = "";
    update();
    input.focus();
  });
})();
