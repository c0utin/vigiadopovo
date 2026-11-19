<script lang="ts">
  import Home from "../+page.svelte";
  import type { PageData } from "./$types";

  // Same page as the homepage, with every collected bill.
  let { data }: { data: PageData } = $props();
</script>

<Home {data} />
