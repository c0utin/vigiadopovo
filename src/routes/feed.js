// Progressive enhancement for the homepage feed. Without JavaScript every
// proposal stays listed; with it, search and topic chips filter the cards.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const filters = $("[data-filters]");
  const input = $("#busca");
  const cards = [...document.querySelectorAll("[data-search]")];
  const chips = [...document.querySelectorAll("[data-topic-filter]")];
  const count = $("[data-count]");
  const periods = [...document.querySelectorAll("[data-period]")];
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
    let shown = 0;
    for (const card of cards) {
      const match =
        card.dataset.search.includes(query) &&
        (!topic || card.dataset.topic === topic);
      card.hidden = !match;
      if (match) shown++;
    }
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
