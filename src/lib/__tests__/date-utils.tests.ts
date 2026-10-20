import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asDate, dayGroupLabel } from "../date-utils";

describe("dayGroupLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T14:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels the current day", () => {
    expect(dayGroupLabel(new Date("2026-10-19T14:30:00.000Z"))).toBe("Today");
  });
  it("labels the previous day", () => {
    expect(dayGroupLabel(new Date("2026-10-18T14:30:00.000Z"))).toBe(
      "Yesterday",
    );
  });
  it("labels an older day in the current year without the year", () => {
    expect(dayGroupLabel(new Date("2026-10-10T14:30:00.000Z"))).toBe("Oct 10");
  });
  it("labels a day in a past year with the year", () => {
    expect(dayGroupLabel(new Date("2025-10-01T14:30:00.000Z"))).toBe(
      "Oct 1, 2025",
    );
  });
  it("accetps an ISO string", () => {
    expect(dayGroupLabel(new Date("2026-10-19T08:00:00"))).toBe("Today");
  });
});

describe("asDate", () => {
  it("reads a timestamp, with Z or with an offet", () => {
    expect(asDate("2026-10-10T14:30:00.000Z")).toBeInstanceOf(Date);
    expect(asDate("2026-10-10T00:00:00,000+00:00")).toEqual(
      new Date("2026-10-10T00:00:00.000Z"),
    );
  });

  it("is null for garbage, null and undefined", () => {
    expect(asDate("not a date")).toBeNull();
    expect(asDate("null")).toBeNull();
    expect(asDate(undefined)).toBeNull();
  });
});
