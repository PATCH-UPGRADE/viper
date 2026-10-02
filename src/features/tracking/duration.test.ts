import { expect, it } from "vitest";
import { formatTimeRange } from "./duration";

it("shows the end time when the length is known", () => {
  const start = new Date(2026, 8, 29, 13);
  expect(formatTimeRange(start, 45)).toBe("1 PM – 1:45 PM");
  expect(formatTimeRange(start, null)).toBe("1 PM");
});
