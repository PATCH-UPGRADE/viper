/** A sort field without its "-" (descending) prefix. */
export function sortFieldKey(field: string): string {
  return field.startsWith("-") ? field.slice(1) : field;
}

/**
 * Sorts rows in memory by comma-separated sort fields ("-" for descending),
 * then by most recently updated, then by id. The id keeps rows that tie on
 * everything else in one order, so a row cannot move between pages.
 *
 * A `null` sort value goes last in both directions, as `nulls: "last"` does in
 * a Prisma orderBy: a row with no value is never the top answer.
 */
export function sortByFields<T extends { id: string; updatedAt: Date }>(
  rows: T[],
  sortFields: string[],
  sortValue: (row: T, key: string) => number | string | null,
): T[] {
  const fields = sortFields.map((field) => ({
    key: sortFieldKey(field),
    desc: field.startsWith("-"),
  }));
  const decorated = rows.map((row) => ({
    row,
    values: fields.map(({ key }) => sortValue(row, key)),
  }));

  decorated.sort((a, b) => {
    for (const [i, { desc }] of fields.entries()) {
      const aVal = a.values[i];
      const bVal = b.values[i];

      if (aVal === null || bVal === null) {
        if (aVal === bVal) continue;
        return aVal === null ? 1 : -1;
      }

      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));

      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    const byUpdate = b.row.updatedAt.getTime() - a.row.updatedAt.getTime();
    if (byUpdate !== 0) return byUpdate;
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });
  return decorated.map(({ row }) => row);
}
