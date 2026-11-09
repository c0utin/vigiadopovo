<script>
  import { asset, resolve } from "$app/paths";
  import "../app.css";
  import { page } from "$app/state";
  let { children, data } = $props();
  const navigation = $derived(
    [
      {
        href: resolve("/"),
        label: "Início",
        section: "/",
        icon: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
      },
      {
        href: resolve("deputados/"),
        label: "Deputados",
        section: "/deputados",
        icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0",
      },
      {
        href: resolve("deputados/ranking/"),
        label: "Ranking",
        section: "/deputados/ranking",
        icon: "M3 20h18M5 20v-6h4v6m1 0V9h4v11m1 0v-8h4v8",
      },
      {
        href: resolve("dados/"),
        label: "Votações",
        section: "/dados",
        icon: "M4 5h16v14H4zM8 12l3 3 5-6",
      },
      {
        href: resolve("sobre/"),
        label: "Sobre",
        section: "/sobre",
        icon: "M12 8h.01M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
      },
    ].filter((item) => data.ranking || item.section !== "/deputados/ranking"),
  );
  // Proposals are listed on the home page, and the method pages hang off
  // Sobre; otherwise the longest matching section wins (the ranking lives
  // under /deputados).
  const route = $derived(
    page.route.id?.startsWith("/transparencia") ? "/sobre" : page.route.id,
  );
  const current = $derived(
    navigation
      .filter((item) => item.section !== "/" && route?.startsWith(item.section))
      .sort((a, b) => b.section.length - a.section.length)[0]?.section ?? "/",
  );
</script>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header wrap">
  <a class="brand" href={resolve("/")} aria-label="Vigia do Povo, início"
    ><span class="brand-icon" aria-hidden="true">◉</span>vigia<span
      class="brand-light">do</span
    >povo<span class="brand-dot">.</span></a
  >
  <nav aria-label="Navegação principal">
    {#each navigation as item}
      <a
        href={item.href}
        aria-current={current === item.section ? "page" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"><path d={item.icon} /></svg
        >
        {item.label}
      </a>
    {/each}
  </nav>
  <span class="independent"
    >Independente<span class="desktop-note">&nbsp;de partidos</span></span
  >
</header>
{@render children()}
<footer class="wrap site-footer">
  <div>
    <a class="brand" href={resolve("/")}
      >vigia<span class="brand-light">do</span>povo<span class="brand-dot"
        >.</span
      ></a
    >
    <p>Iniciativa independente, sem vínculo com governo ou partidos.</p>
  </div>
  <div class="footer-links">
    <a href={resolve("transparencia/")}>Transparência dos dados</a><a
      href={asset("dados.json")}
      download>Baixar dados abertos ↗</a
    ><a href={resolve("llms.txt")}>Dados para IA (llms.txt)</a>
  </div>
</footer>
