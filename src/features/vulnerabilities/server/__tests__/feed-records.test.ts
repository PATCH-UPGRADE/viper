// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => {
  const db = {
    vulnerabilityRecord: { upsert: vi.fn(async () => ({ id: "rec-1" })) },
    metric: { upsert: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: db }));

import { upsertFeedRecord } from "../feed-records";

const CVE = "CVE-2024-1234";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertFeedRecord", () => {
  it("upserts the EPSS record by (source, CVE, vulnerability) and its metric", async () => {
    const raw = { cve: CVE, epss: "0.12" };
    await upsertFeedRecord({
      vulnerabilityId: "v-1",
      cve: CVE,
      metric: { source: "FIRST_EPSS", score: 0.12, percentile: 0.9 },
      raw,
    });

    expect(db.vulnerabilityRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source_sourceId_vulnerabilityId: {
            source: "FIRST_EPSS",
            sourceId: CVE,
            vulnerabilityId: "v-1",
          },
        },
        create: {
          vulnerabilityId: "v-1",
          source: "FIRST_EPSS",
          sourceId: CVE,
          raw,
        },
        update: { raw },
      }),
    );
    expect(db.metric.upsert).toHaveBeenCalledWith({
      where: { recordId_type: { recordId: "rec-1", type: "EPSS" } },
      create: {
        recordId: "rec-1",
        type: "EPSS",
        score: 0.12,
        percentile: 0.9,
        flag: null,
      },
      update: { score: 0.12, percentile: 0.9, flag: null },
    });
  });

  it("writes KEV as a flag, with no score, and leaves raw alone", async () => {
    await upsertFeedRecord({
      vulnerabilityId: "v-1",
      cve: CVE,
      metric: { source: "CISA_KEV", inKev: false },
    });

    expect(db.vulnerabilityRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { raw: undefined } }),
    );
    expect(db.metric.upsert).toHaveBeenCalledWith({
      where: { recordId_type: { recordId: "rec-1", type: "KEV" } },
      create: {
        recordId: "rec-1",
        type: "KEV",
        score: null,
        percentile: null,
        flag: false,
      },
      update: { score: null, percentile: null, flag: false },
    });
  });
});
