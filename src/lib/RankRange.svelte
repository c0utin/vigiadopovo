<script lang="ts">
  // Where a rank sits among `total` deputies (1st at the left), with the band
  // of best and worst ranks under the alternative weightings. Decorative: the
  // same numbers are always printed next to it.
  let {
    rank,
    range,
    total,
  }: { rank: number; range: [number, number]; total: number } = $props();
  const at = (r: number) => (total > 1 ? ((r - 1) / (total - 1)) * 100 : 0);
</script>

<span
  class="range-track"
  style:--from={at(range[0])}
  style:--to={at(range[1])}
  style:--at={at(rank)}
  aria-hidden="true"
  ><span class="range-band"></span><span class="range-dot"></span></span
>
