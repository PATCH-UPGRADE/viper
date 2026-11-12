import { describe, expect, it } from "vitest";
import type { MetricResponse } from "../types";
import {
  cvssScores,
  recordSourceBlocks,
  recordSourceName,
  recordTypeText,
  summarizeMetrics,
} from "../utils";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

const cvss = (
  score: number | null,
  updatedAt: Date,
  vector: string | null = null,
): MetricResponse => ({
  id: `cvss-${updatedAt.getTime()}`,
  type: "CVSS_V3_1",
  updatedAt,
  vector,
  score,
  severity: null,
});

describe("summarizeMetrics", () => {
  it("gives all nulls for no metrics", () => {
    expect(summarizeMetrics([])).toEqual({ cvss: null, epss: null, kev: null });
  });

  it("picks the newest CVSS across records", () => {
    const summary = summarizeMetrics([
      cvss(9.8, day(1), "CVSS:3.1/AV:N"),
      cvss(7.5, day(3), "CVSS:3.1/AV:L"),
      cvss(5.0, day(2)),
    ]);
    expect(summary.cvss).toMatchObject({
      type: "CVSS_V3_1",
      score: 7.5,
      vector: "CVSS:3.1/AV:L",
    });
  });

  it("returns the picked metric itself, with whatever the caller attached", () => {
    const record = { id: "record-2" };
    const summary = summarizeMetrics([
      { ...cvss(9.8, day(1)), record: { id: "record-1" } },
      { ...cvss(8.1, day(2)), record },
    ]);
    expect(summary.cvss?.record).toBe(record);
  });

  it("picks up the EPSS and KEV feeds", () => {
    const summary = summarizeMetrics([
      {
        id: "e",
        type: "EPSS",
        updatedAt: day(2),
        score: 0.35,
        percentile: 0.9,
      },
      { id: "k", type: "KEV", updatedAt: day(4), inKev: true },
    ]);
    expect(summary.epss).toMatchObject({
      score: 0.35,
      percentile: 0.9,
      updatedAt: day(2),
    });
    expect(summary.kev).toMatchObject({ inKev: true, updatedAt: day(4) });
  });
});

describe("cvssScores", () => {
  it("lists every scored CVSS metric, newest first", () => {
    const scores = cvssScores([
      cvss(9.8, day(1)),
      cvss(null, day(4)),
      cvss(8.1, day(3)),
      { id: "q", type: "QUALITATIVE", updatedAt: day(6), severity: "High" },
      {
        id: "e",
        type: "EPSS",
        updatedAt: day(5),
        score: 0.5,
        percentile: null,
      },
    ]);
    expect(scores.map((metric) => metric.score)).toEqual([8.1, 9.8]);
  });
});

const mapped = (name: string) => ({ integration: { name } });

describe("recordSourceName", () => {
  it("names a record by its integration when it has an external mapping", () => {
    expect(
      recordSourceName({
        source: "VENDOR_ADVISORY",
        user: { name: "CISA CSAF Service" },
        externalMapping: mapped("CISA CSAF"),
      }),
    ).toBe("CISA CSAF");
  });

  it("names a TA3 submission by the TA3 user who sent it", () => {
    expect(
      recordSourceName({ source: "TA3", user: { name: "Blueflow Service" } }),
    ).toBe("Blueflow Service");
  });

  it("falls back to the source", () => {
    expect(recordSourceName({ source: "FIRST_EPSS", user: null })).toBe(
      "FIRST EPSS",
    );
  });
});

describe("recordTypeText", () => {
  it("gives the kind and source ID beside an integration's name", () => {
    expect(
      recordTypeText({
        source: "VENDOR_ADVISORY",
        sourceId: "GE-2020-004",
        externalMapping: mapped("CISA CSAF"),
      }),
    ).toBe("Vendor advisory GE-2020-004");
  });

  it("is null when the name already says it, and leaves a feed's CVE off", () => {
    expect(
      recordTypeText({ source: "CISA_KEV", sourceId: "CVE-2026-0001" }),
    ).toBeNull();
    expect(recordTypeText({ source: "AI", sourceId: null })).toBeNull();
  });
});

describe("recordSourceBlocks", () => {
  it("gives one block per record, without the EPSS and KEV feeds", () => {
    const blocks = recordSourceBlocks([
      {
        id: "r1",
        source: "VENDOR_ADVISORY",
        externalMapping: mapped("CISA CSAF"),
      },
      { id: "r2", source: "FIRST_EPSS" },
      { id: "r3", source: "TA3", user: { name: "Blueflow Service" } },
      { id: "r4", source: "TA3", user: { name: "Blueflow Service" } },
      { id: "r5", source: "AI" },
      { id: "r6", source: "CISA_KEV" },
    ]);
    expect(blocks.map(({ name, kind }) => [name, kind])).toEqual([
      ["CISA CSAF", "integration"],
      ["Blueflow Service", "person"],
      ["Blueflow Service", "person"],
      ["AI crawler", "automation"],
    ]);
  });
});
