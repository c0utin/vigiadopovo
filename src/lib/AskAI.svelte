<script lang="ts">
  // A link to this page's data as Markdown, to paste into an AI assistant.
  // Pages ship no framework JavaScript. Only the homepage has a budget for a
  // small inline script (scripts/check-performance.ts), so only it gets the
  // copy button; elsewhere the link alone is enough.
  let {
    href,
    what,
    copy = false,
  }: { href: string; what: string; copy?: boolean } = $props();
  const script = `(() => {
    const box = document.currentScript.parentElement;
    const button = box.querySelector("button");
    const link = box.querySelector("a");
    if (!navigator.clipboard) return;
    button.hidden = false;
    button.addEventListener("click", () =>
      navigator.clipboard.writeText(link.href).then(() => {
        button.textContent = "Link copiado ✓";
        setTimeout(() => (button.textContent = "Copiar link para IA"), 2500);
      }),
    );
  })()`;
</script>

<svelte:head><link rel="alternate" type="text/markdown" {href} /></svelte:head>
<div class="ask-ai">
  <p>
    <strong>Usar com IA.</strong> Copie e cole este link no ChatGPT, Claude,
    Gemini ou outra IA para conversar sobre {what}, com os dados oficiais em
    texto simples.
  </p>
  <div class="ask-ai-actions">
    <a class="button secondary" {href}>Abrir texto para IA</a>
    {#if copy}<button type="button" class="button primary" hidden
        >Copiar link para IA</button
      >
      {@html `<script>${script}<\/script>`}{/if}
  </div>
</div>
