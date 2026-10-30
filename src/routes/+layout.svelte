<script>
  import "../app.css";
  import { page } from "$app/state";
  let { children } = $props();
  const navigation = [
    {
      href: "/#propostas",
      label: "Propostas",
      section: "/proposta/",
      icon: "M7 3h7l4 4v14H6V3h1m7 0v5h4M9 12h6M9 16h6",
    },
    {
      href: "/dados/",
      label: "Dados",
      section: "/dados/",
      icon: "M5 20v-7m7 7V4m7 16V9",
    },
    {
      href: "/transparencia/",
      label: "Pipeline",
      section: "/transparencia/",
      icon: "M5 5h14v5H5zM5 15h14v5H5zM12 10v5",
    },
    {
      href: "/sobre/",
      label: "Sobre",
      section: "/sobre/",
      icon: "M12 8h.01M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    },
  ];
</script>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header wrap">
  <a class="brand" href="/" aria-label="Vigia do Povo, início"
    ><span class="brand-icon" aria-hidden="true">◉</span> vigia<span
      class="brand-light">do</span
    >povo<span class="brand-dot">.</span></a
  >
  <nav aria-label="Navegação principal">
    {#each navigation as item}
      <a
        href={item.href}
        aria-current={page.url.pathname.startsWith(item.section) ||
        (item.label === "Propostas" && page.url.pathname === "/")
          ? "page"
          : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"><path d={item.icon} /></svg
        >
        {item.label}
      </a>
    {/each}
  </nav>
  <span class="independent"
    >Independente<span class="desktop-note">. De todos.</span></span
  >
</header>
{@render children()}
<footer class="wrap site-footer">
  <div>
    <a class="brand" href="/"
      >vigia<span class="brand-light">do</span>povo<span class="brand-dot"
        >.</span
      ></a
    >
    <p>Informação pública. Entendimento de todos.</p>
  </div>
  <div>
    <p>Iniciativa independente, sem vínculo com o governo ou partidos.</p>
    <a href="/transparencia/">Transparência da pipeline</a><span
      class="footer-separator">·</span
    ><a href="/dados.json" download>Baixar dados abertos ↗</a>
  </div>
</footer>
