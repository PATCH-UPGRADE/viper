const CHARACTERS_THAT_NEED_QUOTES = /[",\r\n]/;

function toCsvCell(value: string): string {
  if (!CHARACTERS_THAT_NEED_QUOTES.test(value)) return value;
  const escapedQuotes = value.replaceAll('"', '""');
  return `"${escapedQuotes}"`;
}

export function toCsv(rows: string[][]): string {
  const lines = rows.map((cells) => cells.map(toCsvCell).join(","));
  return lines.join("\r\n");
}
