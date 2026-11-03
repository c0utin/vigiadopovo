<script lang="ts">
  // Server-rendered SVG: no JavaScript. Values are 0–100 percentiles.
  let {
    axes,
    label,
  }: {
    axes: { label: string; value: number; detail: string }[];
    label: string;
  } = $props();

  // Wider than tall: horizontal labels need room on both sides.
  const width = 400;
  const height = 330;
  const center = { x: width / 2, y: height / 2 + 4 };
  const radius = 108;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axes.length;
    const r = (radius * value) / 100;
    return [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle)];
  };
  const ring = (value: number) =>
    axes.map((_, i) => point(i, value).join(",")).join(" ");
  const shape = $derived(
    axes.map((axis, i) => point(i, axis.value).join(",")).join(" "),
  );
  const labels = $derived(
    axes.map((axis, i) => {
      const [x, y] = point(i, 124);
      const anchor =
        Math.abs(x - center.x) < 8 ? "middle" : x > center.x ? "start" : "end";
      return { ...axis, x, y: y < center.y - 8 ? y - 10 : y + 6, anchor };
    }),
  );
</script>

<svg
  class="radar"
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label={label}
>
  {#each [25, 75, 100] as level}<polygon
      points={ring(level)}
      class="grid"
    />{/each}
  <polygon points={ring(50)} class="median" />
  {#each axes as _, i}{@const [x, y] = point(i, 100)}<line
      x1={center.x}
      y1={center.y}
      x2={x}
      y2={y}
      class="grid"
    />{/each}
  <polygon points={shape} class="shape" />
  {#each axes as axis, i}{@const [x, y] = point(i, axis.value)}<circle
      cx={x}
      cy={y}
      r="4"
      class="dot"
    />{/each}
  {#each labels as item}<text x={item.x} y={item.y} text-anchor={item.anchor}
      ><tspan class="axis">{item.label}</tspan><tspan
        x={item.x}
        dy="15"
        class="value">{item.detail}</tspan
      ></text
    >{/each}
</svg>

<style>
  .radar {
    display: block;
    width: 100%;
    max-width: 420px;
    height: auto;
    margin-inline: auto;
    overflow: visible;
  }
  .grid {
    fill: none;
    stroke: #cfd8c8;
    stroke-width: 1;
  }
  .median {
    fill: none;
    stroke: #8a9a86;
    stroke-dasharray: 4 4;
  }
  .shape {
    fill: #d8ed95b3;
    stroke: #173e34;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .dot {
    fill: #173e34;
  }
  text {
    font-size: 12px;
    fill: #173c34;
  }
  .axis {
    font-weight: 700;
  }
  .value {
    fill: #58685d;
  }
</style>
