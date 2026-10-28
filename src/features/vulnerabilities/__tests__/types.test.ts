// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { type Metric, MetricType, Prisma } from "@/generated/prisma";
import {
  metricResponseSchema,
  toMetricResponse,
  toVulnerabilityRecordResponse,
} from "../types";

const at = new Date("2026-01-01T00:00:00Z");

const metric = (fields: Partial<Metric>): Metric => ({
  id: "metric-1",
  recordId: "record-1",
  type: MetricType.CVSS_V3_1,
  vector: null,
  score: null,
  percentile: null,
  severity: null,
  flag: null,
  createdAt: at,
  updatedAt: at,
  ...fields,
});

describe("toMetricResponse", () => {
  it("returns a CVSS metric's vector, score and severity", () => {
    const response = toMetricResponse(
      metric({
        type: MetricType.CVSS_V3_1,
        vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
        score: new Prisma.Decimal(8.1),
        severity: "High",
      }),
    );

    expect(response).toEqual({
      id: "metric-1",
      type: "CVSS_V3_1",
      updatedAt: at,
      vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      score: 8.1,
      severity: "High",
    });
  });

  it("returns only a qualitative metric's severity", () => {
    const response = toMetricResponse(
      metric({ type: MetricType.QUALITATIVE, severity: "Low" }),
    );

    expect(response).toEqual({
      id: "metric-1",
      type: "QUALITATIVE",
      updatedAt: at,
      severity: "Low",
    });
  });

  it("returns an EPSS metric's probability and percentile", () => {
    const response = toMetricResponse(
      metric({
        type: MetricType.EPSS,
        score: new Prisma.Decimal(0.12345),
        percentile: new Prisma.Decimal(0.9),
      }),
    );

    expect(response).toEqual({
      id: "metric-1",
      type: "EPSS",
      updatedAt: at,
      score: 0.12345,
      percentile: 0.9,
    });
  });

  it("returns a KEV check that found no listing as inKev false", () => {
    const response = toMetricResponse(
      metric({ type: MetricType.KEV, flag: false }),
    );

    expect(response).toEqual({
      id: "metric-1",
      type: "KEV",
      updatedAt: at,
      inKev: false,
    });
  });

  it("produces a response for every metric type that the schema accepts", () => {
    for (const type of Object.values(MetricType)) {
      const response = toMetricResponse(metric({ type }));
      expect(metricResponseSchema.parse(response)).toEqual(response);
    }
  });
});

describe("toVulnerabilityRecordResponse", () => {
  it("maps the record's metrics and gives its TA3 submission the vulnerability id", () => {
    const response = toVulnerabilityRecordResponse({
      id: "record-1",
      vulnerabilityId: "vuln-1",
      source: "TA3",
      sourceId: null,
      summary: "Pump overflow",
      details: null,
      publishedAt: null,
      userId: "user-1",
      raw: null,
      metrics: [
        metric({ type: MetricType.CVSS_V3_1, score: new Prisma.Decimal(8.1) }),
      ],
      ta3Submission: {
        id: "ta3-1",
        recordId: "record-1",
        deviceArtifactId: null,
        sarif: {},
        narrative: null,
        impact: null,
        exploitUri: null,
        alohaStatus: null,
        alohaLog: {},
        createdAt: at,
        updatedAt: at,
      },
      createdAt: at,
      updatedAt: at,
    });

    expect(response.metrics).toEqual([
      expect.objectContaining({ type: "CVSS_V3_1", score: 8.1 }),
    ]);
    expect(response.metrics[0]).not.toHaveProperty("percentile");
    expect(response.ta3Submission).toMatchObject({
      recordId: "record-1",
      vulnerabilityId: "vuln-1",
    });
  });
});
