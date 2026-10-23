// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type RecordRow = {
  id: string;
  vulnerabilityId: string;
  source: string;
  sourceId: string;
  raw?: unknown;
};
type MetricRow = { recordId: string; type: string; [key: string]: unknown };

const { db, records, metrics } = vi.hoisted(() => {
  const records: RecordRow[] = [];
  const metrics: MetricRow[] = [];
  const db = {
    vulnerabilityRecord: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { vulnerabilityId: string; source: string };
        }) =>
          records.find(
            (row) =>
              row.vulnerabilityId === where.vulnerabilityId &&
              row.source === where.source,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<RecordRow, "id"> }) => {
        const row = { id: `rec-${records.length + 1}`, ...data };
        records.push(row);
        return { id: row.id };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<RecordRow>;
        }) => {
          const row = records.find((existing) => existing.id === where.id);
          if (!row) throw new Error("no record");
          Object.assign(row, data);
          return { id: row.id };
        },
      ),
    },
    metric: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { recordId_type: { recordId: string; type: string } };
          create: MetricRow;
          update: Record<string, unknown>;
        }) => {
          const { recordId, type } = where.recordId_type;
          const row = metrics.find(
            (existing) =>
              existing.recordId === recordId && existing.type === type,
          );
          if (row) Object.assign(row, update);
          else metrics.push({ ...create });
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, records, metrics };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: db }));

import { upsertFeedRecord } from "../feed-records";

const epss = (score: number, cve = "CVE-2024-1234") => ({
  vulnerabilityId: "v-1",
  cve,
  metric: { source: "FIRST_EPSS" as const, score, percentile: 0.9 },
  raw: { cve, epss: String(score) },
});

beforeEach(() => {
  vi.clearAllMocks();
  records.length = 0;
  metrics.length = 0;
});

describe("upsertFeedRecord", () => {
  it("creates the record and its EPSS metric on the first call", async () => {
    await upsertFeedRecord(epss(0.12));

    expect(records).toEqual([
      {
        id: "rec-1",
        vulnerabilityId: "v-1",
        source: "FIRST_EPSS",
        sourceId: "CVE-2024-1234",
        raw: { cve: "CVE-2024-1234", epss: "0.12" },
      },
    ]);
    expect(metrics).toEqual([
      {
        recordId: "rec-1",
        type: "EPSS",
        score: 0.12,
        percentile: 0.9,
        flag: null,
      },
    ]);
  });

  it("updates the same record and metric on a second call", async () => {
    await upsertFeedRecord(epss(0.12));
    await upsertFeedRecord(epss(0.5));

    expect(records).toHaveLength(1);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ score: 0.5 });
    // Every call writes the metric, which is what bumps its updatedAt.
    expect(db.metric.upsert).toHaveBeenCalledTimes(2);
  });

  it("moves the existing record to a new CVE instead of adding a second one", async () => {
    await upsertFeedRecord(epss(0.12, "CVE-2024-1234"));
    await upsertFeedRecord(epss(0.3, "CVE-2023-0001"));

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sourceId: "CVE-2023-0001" });
  });

  it("writes KEV as a flag, with no score", async () => {
    await upsertFeedRecord({
      vulnerabilityId: "v-1",
      cve: "CVE-2024-1234",
      metric: { source: "CISA_KEV", inKev: false },
    });

    expect(records[0]).toMatchObject({ source: "CISA_KEV" });
    expect(metrics).toEqual([
      {
        recordId: "rec-1",
        type: "KEV",
        score: null,
        percentile: null,
        flag: false,
      },
    ]);
  });

  it("keeps one record per source on the same vulnerability", async () => {
    await upsertFeedRecord(epss(0.12));
    await upsertFeedRecord({
      vulnerabilityId: "v-1",
      cve: "CVE-2024-1234",
      metric: { source: "CISA_KEV", inKev: true },
    });

    expect(records.map((row) => row.source)).toEqual([
      "FIRST_EPSS",
      "CISA_KEV",
    ]);
  });
});
