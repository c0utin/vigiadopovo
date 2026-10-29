export function date(value: string | null | undefined) {
  if (!value) return "Não informada";
  if (value.endsWith("Z"))
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  // Câmara timestamps without offsets are local civil times, not UTC.
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
