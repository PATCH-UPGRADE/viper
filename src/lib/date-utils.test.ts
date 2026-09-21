// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayGroupLabel } from "./date-utils";

describe("dayGroupLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels the current day", () => {
    expect(dayGroupLabel(new Date("2026-09-16T08:12:00"))).toBe("Today");
  });

  it("labels the previous day", () => {
    expect(dayGroupLabel(new Date("2026-09-15T21:48:00"))).toBe("Yesterday");
  });

  it("labels an older day in the current year without the year", () => {
    expect(dayGroupLabel(new Date("2026-09-14T09:37:00"))).toBe("Sep 14");
  });

  it("labels a day in a past year with the year", () => {
    expect(dayGroupLabel(new Date("2025-12-02T09:37:00"))).toBe("Dec 2, 2025");
  });

  it("accepts an ISO string", () => {
    expect(dayGroupLabel("2026-09-16T08:12:00")).toBe("Today");
  });
});
