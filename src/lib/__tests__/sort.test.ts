// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sortByFields } from "../sort";

describe("sortByFields", () => {
  const row = (id: string, a: number, b: string, updatedAt: string) => ({
    id,
    a,
    b,
    updatedAt: new Date(updatedAt),
  });
  const rows = [
    row("x", 1, "m", "2026-01-01"),
    row("y", 2, "m", "2026-01-01"),
    row("z", 2, "a", "2026-01-01"),
    row("w", 1, "m", "2026-02-01"),
  ];
  const value = (r: (typeof rows)[number], key: string) =>
    key === "a" ? r.a : r.b;

  it("sorts by each field in turn, then by most recent update", () => {
    expect(sortByFields(rows, ["-a", "b"], value).map((r) => r.id)).toEqual([
      "z",
      "y",
      "w",
      "x",
    ]);
  });

  // Postgres returns the rows in no fixed order, so the same rows can arrive
  // in a different order on the next page request.
  it("orders rows that tie on every field by id, whatever order they arrive in", () => {
    const tied = [
      row("b", 1, "m", "2026-01-01"),
      row("a", 1, "m", "2026-01-01"),
      row("c", 1, "m", "2026-01-01"),
    ];
    expect(sortByFields(tied, ["a"], value).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      sortByFields([...tied].reverse(), ["a"], value).map((r) => r.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not reorder the input array", () => {
    sortByFields(rows, ["-a"], value);
    expect(rows.map((r) => r.id)).toEqual(["x", "y", "z", "w"]);
  });

  it("puts a null value last whichever way the field sorts", () => {
    const scored = [
      { id: "a", score: 0.2, updatedAt: new Date("2026-01-01") },
      { id: "b", score: null, updatedAt: new Date("2026-01-01") },
      { id: "c", score: 0.9, updatedAt: new Date("2026-01-01") },
    ];
    const score = (r: (typeof scored)[number]) => r.score;
    expect(sortByFields(scored, ["score"], score).map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(sortByFields(scored, ["-score"], score).map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
