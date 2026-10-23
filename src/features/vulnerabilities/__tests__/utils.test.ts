import { describe, expect, it } from "vitest";
import type { MetricResponse } from "../types";
import { recordSources, summarizeMetrics } from "../utils";

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
    expect(summary.cvss).toEqual({
      type: "CVSS_V3_1",
      score: 7.5,
      vector: "CVSS:3.1/AV:L",
      severity: null,
    });
  });

  it("skips a CVSS metric with no score", () => {
    const summary = summarizeMetrics([cvss(6.1, day(1)), cvss(null, day(5))]);
    expect(summary.cvss?.score).toBe(6.1);
  });

  it("does not treat a qualitative rating as CVSS", () => {
    const summary = summarizeMetrics([
      { id: "q", type: "QUALITATIVE", updatedAt: day(1), severity: "High" },
    ]);
    expect(summary.cvss).toBeNull();
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
    expect(summary.epss).toEqual({
      score: 0.35,
      percentile: 0.9,
      updatedAt: day(2),
    });
    expect(summary.kev).toEqual({ inKev: true, updatedAt: day(4) });
  });

  it("keeps a KEV check that found no listing", () => {
    const summary = summarizeMetrics([
      { id: "k", type: "KEV", updatedAt: day(4), inKev: false },
    ]);
    expect(summary.kev).toEqual({ inKev: false, updatedAt: day(4) });
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
