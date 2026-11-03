// Progressive enhancement for the deputies list. Without JavaScript every
// deputy stays listed; with it, name search and party/UF filters apply.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const name = $("#busca-deputado");
  const party = $("#partido");
  const state = $("#uf");
  const cards = [...document.querySelectorAll("[data-deputy]")];
  const count = $("[data-count]");
  const empty = $("[data-empty]");
  const clean = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const update = () => {
    const query = clean(name.value);
    let shown = 0;
    for (const card of cards) {
      const match =
        card.dataset.search.includes(query) &&
        (!party.value || card.dataset.party === party.value) &&
        (!state.value || card.dataset.state === state.value);
      card.hidden = !match;
      if (match) shown++;
    }
    count.textContent = `${shown} ${shown === 1 ? "deputado" : "deputados"}`;
    empty.hidden = shown > 0;
  };
  $("[data-filters]").hidden = false;
  name.addEventListener("input", update);
  for (const select of [party, state])
    select.addEventListener("change", update);
  update();
})();
