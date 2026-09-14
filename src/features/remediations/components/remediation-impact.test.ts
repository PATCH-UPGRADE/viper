import { describe, expect, it } from "vitest";
import { formatDowntime } from "./remediation-impact";

describe("formatDowntime", () => {
  it.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [2, "2 seconds"],
    [59, "59 seconds"],
  ])("renders %i as %s", (seconds, expected) => {
    expect(formatDowntime(seconds)).toBe(expected);
  });

  // 60 is the first value that leaves the seconds branch, and 89 is the last
  // that still rounds down to one minute.
  it.each([
    [60, "1 minute"],
    [89, "1 minute"],
    [90, "2 minutes"],
    [3569, "59 minutes"],
  ])("renders %i as %s", (seconds, expected) => {
    expect(formatDowntime(seconds)).toBe(expected);
  });

  // 3599 seconds rounds to 60 minutes, which fails `minutes < 60`, so the
  // minutes branch never says "60 minutes".
  it.each([
    [3599, "1 hour"],
    [3600, "1 hour"],
    [5400, "1.5 hours"],
    [7200, "2 hours"],
  ])("renders %i as %s", (seconds, expected) => {
    expect(formatDowntime(seconds)).toBe(expected);
  });
});
