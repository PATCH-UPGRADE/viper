// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type IdentifierRow = {
  value: string;
  displayValue: string;
  vulnerabilityId: string;
};

const { db, identifiers } = vi.hoisted(() => {
  const identifiers: IdentifierRow[] = [];
  const matches = (
    row: IdentifierRow,
    where: {
      value?: { in: string[] };
      vulnerabilityId?: string | { not: string };
    },
  ) =>
    (!where.value || where.value.in.includes(row.value)) &&
    (where.vulnerabilityId === undefined ||
      (typeof where.vulnerabilityId === "string"
        ? row.vulnerabilityId === where.vulnerabilityId
        : row.vulnerabilityId !== where.vulnerabilityId.not));

  const db = {
    vulnerabilityIdentifier: {
      findMany: vi.fn(async ({ where }) =>
        identifiers.filter((row) => matches(row, where)),
      ),
      createMany: vi.fn(async ({ data }: { data: IdentifierRow[] }) => {
        for (const row of data) {
          if (!identifiers.some((existing) => existing.value === row.value)) {
            identifiers.push(row);
          }
        }
      }),
    },
    vulnerability: {
      create: vi.fn(),
      update: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    vulnerabilityRecord: {
      create: vi.fn(async ({ data }) => ({ id: "rec-1", ...data })),
      update: vi.fn(async ({ data }) => ({ id: "rec-1", ...data })),
      findUnique: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    metric: {
      findFirst: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    tA3Submission: {
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    issue: { createMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, identifiers };
});

vi.mock("@/lib/db", () => ({ default: db }));

import {
  createVulnerabilityRecord,
  deleteVulnerabilityRecord,
  updateVulnerabilityRecord,
} from "../records";

const SARIF = { version: "2.1.0", runs: [] };

/** vulnerability.create as Prisma does it: the nested identifiers land in the table. */
function createsVulnerability(id: string) {
  db.vulnerability.create.mockImplementationOnce(async ({ data }) => {
    for (const identifier of data.identifiers.create) {
      identifiers.push({ ...identifier, vulnerabilityId: id });
    }
    return { id };
  });
}

const ta3 = (overrides = {}) => ({
  source: "TA3" as const,
  identifiers: ["cve-2024-1234"],
  details: "Buffer overflow",
  metrics: [{ type: "CVSS_V3_1" as const, score: 9.8 }],
  deviceGroupMatchingIds: ["m-1", "m-2"],
  ta3Submission: {
    sarif: SARIF,
    narrative: "How it's exploited",
    impact: "Pumps stop",
  },
  userId: "user-1",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  identifiers.length = 0;
});

describe("createVulnerabilityRecord", () => {
  it("creates a vulnerability for an unknown CVE, with its record, metric and submission", async () => {
    createsVulnerability("v-1");

    const result = await createVulnerabilityRecord(ta3(), {
      actingUserId: "user-1",
    });

    expect(result).toMatchObject({
      vulnerabilityId: "v-1",
      vulnerabilityCreated: true,
    });
    const [{ data: vulnerability }] = db.vulnerability.create.mock.calls[0];
    expect(vulnerability).toMatchObject({
      displayId: "CVE-2024-1234",
      identifiers: {
        create: [{ value: "CVE-2024-1234", displayValue: "CVE-2024-1234" }],
      },
      description: "Buffer overflow",
      narrative: "How it's exploited",
      impact: "Pumps stop",
      severity: "Critical",
      cveId: "CVE-2024-1234",
      cvssScore: 9.8,
      sarif: SARIF,
      userId: "user-1",
    });

    const [{ data: record }] = db.vulnerabilityRecord.create.mock.calls[0];
    expect(record).toMatchObject({
      vulnerabilityId: "v-1",
      source: "TA3",
      userId: "user-1",
      metrics: {
        create: [expect.objectContaining({ score: 9.8, severity: "Critical" })],
      },
      ta3Submission: { create: expect.objectContaining({ sarif: SARIF }) },
    });
  });

  it("attaches the devices and opens their baseline Issues", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3(), { actingUserId: "user-1" });

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    expect(data.deviceGroupMatchings).toEqual({
      connect: [{ id: "m-1" }, { id: "m-2" }],
    });
    expect(db.issue.createMany).toHaveBeenCalledWith({
      data: [
        { vulnerabilityId: "v-1", deviceGroupMatchingId: "m-1" },
        { vulnerabilityId: "v-1", deviceGroupMatchingId: "m-2" },
      ],
      skipDuplicates: true,
    });
  });

  it("adds a second record for a known CVE to the same vulnerability", async () => {
    identifiers.push({
      value: "CVE-2024-1234",
      displayValue: "CVE-2024-1234",
      vulnerabilityId: "v-1",
    });

    const result = await createVulnerabilityRecord(
      ta3({ identifiers: ["CVE-2024-1234", "GHSA-abcd-efgh-ijkl"] }),
      { actingUserId: "user-2" },
    );

    expect(result).toMatchObject({
      vulnerabilityId: "v-1",
      vulnerabilityCreated: false,
    });
    expect(db.vulnerability.create).not.toHaveBeenCalled();
    expect(identifiers.map((row) => row.value)).toEqual([
      "CVE-2024-1234",
      "GHSA-ABCD-EFGH-IJKL",
    ]);
    expect(db.vulnerabilityRecord.create.mock.calls[0][0].data).toMatchObject({
      vulnerabilityId: "v-1",
    });
  });

  it("joins the winner when a concurrent request created the vulnerability first", async () => {
    db.vulnerability.create.mockImplementationOnce(async () => {
      identifiers.push({
        value: "CVE-2024-1234",
        displayValue: "CVE-2024-1234",
        vulnerabilityId: "v-winner",
      });
      throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
    });

    const result = await createVulnerabilityRecord(ta3(), {
      actingUserId: "user-1",
    });

    expect(result).toMatchObject({
      vulnerabilityId: "v-winner",
      vulnerabilityCreated: false,
    });
  });

  it("gives a record with no identifiers a new vulnerability with a VIPER ID", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3({ identifiers: [] }), {
      actingUserId: "user-1",
    });

    const [{ data }] = db.vulnerability.create.mock.calls[0];
    expect(data.displayId).toMatch(/^VIPER-[0-9A-F]{12}$/);
    expect(data.identifiers.create).toEqual([
      { value: data.displayId, displayValue: data.displayId },
    ]);
    expect(data.cveId).toBeNull();
  });

  it("rejects a TA3 submission on a record that isn't TA3", async () => {
    await expect(
      createVulnerabilityRecord(ta3({ source: "OTHER" }), {
        actingUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.vulnerability.create).not.toHaveBeenCalled();
  });

  it("deletes the vulnerability it just created when the record can't be written", async () => {
    createsVulnerability("v-1");
    db.vulnerabilityRecord.create.mockRejectedValueOnce(new Error("bad FK"));

    await expect(
      createVulnerabilityRecord(ta3(), { actingUserId: "user-1" }),
    ).rejects.toThrow("bad FK");
    expect(db.vulnerability.deleteMany).toHaveBeenCalledWith({
      where: { id: "v-1" },
    });
  });
});

describe("refreshing the legacy columns", () => {
  it("copies the newest metric and submission onto the vulnerability", async () => {
    createsVulnerability("v-1");
    db.metric.findFirst
      .mockResolvedValueOnce({
        score: { toNumber: () => 5.3 },
        vector: "CVSS:3.1/AV:N",
      } as never)
      .mockResolvedValueOnce({ severity: "Medium" } as never);
    db.tA3Submission.findFirst.mockResolvedValueOnce({
      sarif: SARIF,
      exploitUri: "https://example.com/x",
      deviceArtifactId: null,
    } as never);

    await createVulnerabilityRecord(ta3(), { actingUserId: "user-1" });

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    expect(data).toMatchObject({
      displayId: "CVE-2024-1234",
      cveId: "CVE-2024-1234",
      cvssScore: 5.3,
      cvssVector: "CVSS:3.1/AV:N",
      severity: "Medium",
      sarif: SARIF,
      exploitUri: "https://example.com/x",
    });
  });

  it("leaves legacy values alone when no record has them", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3({ identifiers: [] }), {
      actingUserId: "user-1",
    });

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    for (const key of [
      "cveId",
      "cvssScore",
      "cvssVector",
      "severity",
      "sarif",
    ]) {
      expect(data).not.toHaveProperty(key);
    }
  });
});

describe("updateVulnerabilityRecord", () => {
  it("replaces the record's metrics and adds devices", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "TA3",
    });

    await updateVulnerabilityRecord("rec-1", {
      summary: "New summary",
      metrics: [{ type: "CVSS_V3_1", score: 4 }],
      deviceGroupMatchingIds: ["m-3"],
    });

    expect(db.metric.deleteMany).toHaveBeenCalledWith({
      where: { recordId: "rec-1" },
    });
    const [{ data }] = db.vulnerabilityRecord.update.mock.calls[0];
    expect(data).toMatchObject({
      summary: "New summary",
      metrics: {
        create: [expect.objectContaining({ score: 4, severity: "Medium" })],
      },
    });
    expect(db.issue.createMany).toHaveBeenCalledWith({
      data: [{ vulnerabilityId: "v-1", deviceGroupMatchingId: "m-3" }],
      skipDuplicates: true,
    });
  });

  it("keeps the metrics when none are given", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "TA3",
    });

    await updateVulnerabilityRecord("rec-1", { summary: "New summary" });

    expect(db.metric.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a TA3 submission on a record that isn't TA3", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "OTHER",
    });

    await expect(
      updateVulnerabilityRecord("rec-1", { ta3Submission: { sarif: SARIF } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is NOT_FOUND for a missing record", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce(null);

    await expect(
      updateVulnerabilityRecord("missing", { summary: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteVulnerabilityRecord", () => {
  it("deletes the vulnerability once only feed records would be left", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
    });
    db.vulnerability.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(deleteVulnerabilityRecord("rec-1")).resolves.toEqual({
      vulnerabilityId: "v-1",
      vulnerabilityDeleted: true,
    });
    expect(db.vulnerability.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "v-1",
        records: {
          none: { source: { notIn: ["FIRST_EPSS", "CISA_KEV"] } },
        },
      },
    });
    expect(db.vulnerability.update).not.toHaveBeenCalled();
  });

  it("keeps the vulnerability, refreshed, while another record remains", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
    });

    await expect(deleteVulnerabilityRecord("rec-1")).resolves.toEqual({
      vulnerabilityId: "v-1",
      vulnerabilityDeleted: false,
    });
    expect(db.vulnerability.update).toHaveBeenCalledOnce();
  });

  it("is NOT_FOUND for a missing record", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce(null);

    await expect(deleteVulnerabilityRecord("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
