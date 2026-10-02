import { describe, expect, it } from "vitest";
import {
  blockMinutes,
  bucketByDay,
  parseAnchor,
  toDateParam,
  visibleDays,
} from "./interruptions-dates";

// Local-time constructors: the helpers are local-timezone by design.
const d = (y: number, m: number, day: number, h = 0, min = 0) =>
  new Date(y, m - 1, day, h, min);
const keys = (days: Date[]) => days.map(toDateParam);

describe("ranges", () => {
  it("parses a date param, falling back to today", () => {
    expect(parseAnchor("2026-03-15", d(2020, 1, 1, 9))).toEqual(d(2026, 3, 15));
    expect(parseAnchor("nope", d(2026, 7, 4, 15))).toEqual(d(2026, 7, 4));
  });

  it("week runs Sunday to Saturday, across a month end and a year end", () => {
    expect(keys(visibleDays(d(2026, 3, 31), "week"))).toEqual([
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
    ]);
    expect(keys(visibleDays(d(2026, 1, 1), "week"))[0]).toBe("2025-12-28");
  });

  it("month pads out to whole weeks", () => {
    const days = visibleDays(d(2026, 3, 10), "month");
    expect(days).toHaveLength(35);
    expect(toDateParam(days[0])).toBe("2026-03-01");
    expect(toDateParam(days[34])).toBe("2026-04-04");
  });
});

describe("bucketByDay", () => {
  it("groups by local day, each day in time order", () => {
    const buckets = bucketByDay([
      { id: "late", scheduledAt: d(2026, 3, 15, 23, 59) },
      { id: "next", scheduledAt: d(2026, 3, 16, 8) },
      { id: "early", scheduledAt: d(2026, 3, 15) },
    ]);
    expect(buckets.get("2026-03-15")?.map((i) => i.id)).toEqual([
      "early",
      "late",
    ]);
    expect(buckets.size).toBe(2);
  });
});

describe("blockMinutes", () => {
  it("is the estimate, an hour with none, and never under 45 minutes", () => {
    expect(blockMinutes(90)).toBe(90);
    expect(blockMinutes(null)).toBe(60);
    expect(blockMinutes(20)).toBe(45);
  });
});
