<script>
  import "../app.css";
  let { children } = $props();
</script>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header wrap">
  <a class="brand" href="/" aria-label="Vigia do Povo, início"
    ><span class="brand-icon" aria-hidden="true">◉</span> vigia<span
      class="brand-light">do</span
    >povo<span class="brand-dot">.</span></a
  >
  <nav aria-label="Navegação principal">
    <a href="/#propostas">Propostas</a><a href="/#como-funciona"
      >Como funciona</a
    ><a href="/sobre/">Fontes e método <span aria-hidden="true">↗</span></a>
  </nav>
  <span class="independent"><span></span> Independente. De todos.</span>
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
    <a href="/sobre/">Transparência e privacidade</a><span
      class="footer-separator">·</span
    ><a href="/dados.json" download>Baixar dados abertos ↗</a>
  </div>
</footer>
