import { describe, expect, it } from "vitest";
import { formatDuration, formatTimeRange } from "./duration";

describe("formatDuration", () => {
  it.each([
    [null, "No estimate"],
    [0, "0 min"],
    [45, "45 min"],
    [120, "2 h"],
    [150, "2 h 30 min"],
  ])("%j -> %s", (minutes, label) => {
    expect(formatDuration(minutes)).toBe(label);
  });
});

describe("formatTimeRange", () => {
  const start = new Date(2026, 8, 29, 13);
  it("shows the end when the length is known", () => {
    expect(formatTimeRange(start, 45)).toBe("1 PM – 1:45 PM");
    expect(formatTimeRange(start, null)).toBe("1 PM");
  });
});
