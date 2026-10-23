import { describe, expect, it } from "vitest";
import type { MetricResponse } from "../types";
import {
  cvssScores,
  recordAttribution,
  recordSources,
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

describe("recordAttribution", () => {
  it("names the source, its ID and the owner when there are any", () => {
    expect(
      recordAttribution({
        source: "VENDOR_ADVISORY",
        sourceId: "GE-2020-004",
        user: null,
      }),
    ).toBe("Vendor advisory GE-2020-004");
    expect(
      recordAttribution({ source: "TA3", user: { name: "Seed User" } }),
    ).toBe("TA3 (Seed User)");
  });
});

describe("recordSources", () => {
  it("lists sources in record order, once each, without the EPSS and KEV feeds", () => {
    const { sources } = recordSources([
      { source: "VENDOR_ADVISORY" },
      { source: "FIRST_EPSS" },
      { source: "TA3" },
      { source: "CISA_KEV" },
      { source: "VENDOR_ADVISORY" },
    ]);
    expect(sources).toEqual(["VENDOR_ADVISORY", "TA3"]);
  });

  it("names each TA3 contributor once and skips records with no owner", () => {
    const { ta3Contributors } = recordSources([
      { source: "TA3", user: { name: "Ada" } },
      { source: "TA3", user: null },
      { source: "TA3", user: { name: "Ada" } },
      { source: "TA3", user: { name: "Grace" } },
      { source: "OTHER", user: { name: "Linus" } },
    ]);
    expect(ta3Contributors).toEqual(["Ada", "Grace"]);
  });
});
