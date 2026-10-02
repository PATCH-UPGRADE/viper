import { expect, it } from "vitest";
import { formatDuration, formatTimeRange } from "./duration";

it("formats a duration and a time range", () => {
  expect(formatDuration(null)).toBe("No estimate");
  expect(formatDuration(150)).toBe("2 h 30 min");
  expect(formatTimeRange(new Date(2026, 8, 29, 13), 45)).toBe("1 PM – 1:45 PM");
});
