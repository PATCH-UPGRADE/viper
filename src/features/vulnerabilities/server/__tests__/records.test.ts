// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type IdentifierRow = {
  value: string;
  displayValue: string;
  vulnerabilityId: string;
};

const { db, identifiers, sendWebhooks, send, SUBMITTED_AT } = vi.hoisted(() => {
  const identifiers: IdentifierRow[] = [];
  const SUBMITTED_AT = new Date("2026-10-21T12:00:00.000Z");
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
      updateMany: vi.fn(async () => ({ count: 1 })),
      // Returns the matchings the update connected. "m-2" is a matching with an UNKNOWN version.
      update: vi.fn(
        async ({
          data,
        }: {
          data: {
            deviceGroupMatchings?: { connect: { id: string }[] };
            [key: string]: unknown;
          };
        }) => ({
          deviceGroupMatchings: (data.deviceGroupMatchings?.connect ?? []).map(
            ({ id }) => ({
              id,
              versionStatus: id === "m-2" ? "UNKNOWN" : "KNOWN",
            }),
          ),
        }),
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    vulnerabilityRecord: {
      // With the include createVulnerabilityRecord asks for: the submission's createdAt.
      create: vi.fn(async ({ data }) => ({
        id: "rec-1",
        ...data,
        ta3Submission: data.ta3Submission ? { createdAt: SUBMITTED_AT } : null,
      })),
      update: vi.fn(async ({ data }) => ({ id: "rec-1", ...data })),
      upsert: vi.fn(async () => ({ id: "rec-inbox" })),
      findUnique: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    metric: {
      findFirst: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    tA3Submission: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async (): Promise<{ id: string } | null> => null),
      upsert: vi.fn(async () => ({
        createdAt: SUBMITTED_AT,
        updatedAt: SUBMITTED_AT,
      })),
    },
    issue: { createMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return {
    db,
    identifiers,
    sendWebhooks: vi.fn(async () => {}),
    send: vi.fn(async () => undefined),
    SUBMITTED_AT,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/lib/prisma-client-extensions", () => ({ sendWebhooks }));
vi.mock("@/inngest/client", () => ({ inngest: { send } }));

import {
  createVulnerabilityRecord,
  deleteVulnerabilityRecord,
  updateVulnerabilityRecord,
  upsertSourceRecord,
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

    const result = await createVulnerabilityRecord(ta3());

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

    await createVulnerabilityRecord(ta3());

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    expect(data.deviceGroupMatchings).toEqual({
      connect: [{ id: "m-1" }, { id: "m-2" }],
    });
    expect(db.issue.createMany).toHaveBeenCalledWith({
      data: [
        {
          vulnerabilityId: "v-1",
          deviceGroupMatchingId: "m-1",
          status: "AFFECTED",
        },
        {
          vulnerabilityId: "v-1",
          deviceGroupMatchingId: "m-2",
          status: "UNDER_INVESTIGATION",
        },
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

  it("requests enrichment once for a vulnerability it creates", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3());

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      name: "vulnerability/enrich.requested",
      data: { vulnerabilityId: "v-1" },
    });
  });

  it("doesn't request enrichment when the vulnerability already exists", async () => {
    identifiers.push({
      value: "CVE-2024-1234",
      displayValue: "CVE-2024-1234",
      vulnerabilityId: "v-1",
    });

    await createVulnerabilityRecord(ta3());

    expect(send).not.toHaveBeenCalled();
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

    const result = await createVulnerabilityRecord(ta3());

    expect(result).toMatchObject({
      vulnerabilityId: "v-winner",
      vulnerabilityCreated: false,
    });
  });

  it("gives a record with no identifiers a new vulnerability with a VIPER ID", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3({ identifiers: [] }));

    const [{ data }] = db.vulnerability.create.mock.calls[0];
    expect(data.displayId).toMatch(/^VIPER-[0-9A-F]{12}$/);
    expect(data.identifiers.create).toEqual([
      { value: data.displayId, displayValue: data.displayId },
    ]);
  });

  it("rejects a TA3 submission on a record that isn't TA3", async () => {
    await expect(
      createVulnerabilityRecord(ta3({ source: "OTHER" })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.vulnerability.create).not.toHaveBeenCalled();
  });

  it("deletes the vulnerability it just created when the record can't be written", async () => {
    createsVulnerability("v-1");
    db.vulnerabilityRecord.create.mockRejectedValueOnce(new Error("bad FK"));

    await expect(createVulnerabilityRecord(ta3())).rejects.toThrow("bad FK");
    expect(db.vulnerability.deleteMany).toHaveBeenCalledWith({
      where: { id: "v-1" },
    });
  });
});

describe("the TA3 submission webhooks", () => {
  const EDITED_AT = new Date("2026-10-22T12:00:00.000Z");

  it("fires once a new record's TA3 submission is written", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3());

    expect(sendWebhooks).toHaveBeenCalledWith(
      "TA3Submission_Created",
      SUBMITTED_AT,
    );
  });

  it("doesn't fire for a record without a TA3 submission", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(
      ta3({ source: "OTHER", ta3Submission: undefined }),
    );

    expect(sendWebhooks).not.toHaveBeenCalled();
  });

  it("fires when an update adds the record's first submission", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "TA3",
    });

    await updateVulnerabilityRecord("rec-1", {
      ta3Submission: { sarif: SARIF },
    });

    expect(sendWebhooks).toHaveBeenCalledWith(
      "TA3Submission_Created",
      SUBMITTED_AT,
    );
  });

  it("fires TA3Submission_Updated when an update changes an existing submission", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "TA3",
    });
    db.tA3Submission.findUnique.mockResolvedValueOnce({ id: "sub-1" });
    db.tA3Submission.upsert.mockResolvedValueOnce({
      createdAt: SUBMITTED_AT,
      updatedAt: EDITED_AT,
    });

    await updateVulnerabilityRecord("rec-1", {
      ta3Submission: { sarif: SARIF },
    });

    expect(sendWebhooks).toHaveBeenCalledTimes(1);
    expect(sendWebhooks).toHaveBeenCalledWith(
      "TA3Submission_Updated",
      EDITED_AT,
    );
  });

  it("doesn't fire when an update leaves the submission alone", async () => {
    db.vulnerabilityRecord.findUnique.mockResolvedValueOnce({
      vulnerabilityId: "v-1",
      source: "TA3",
    });

    await updateVulnerabilityRecord("rec-1", { summary: "New summary" });

    expect(sendWebhooks).not.toHaveBeenCalled();
  });
});

describe("refreshing the vulnerability", () => {
  it("takes its severity from the newest rated metric", async () => {
    createsVulnerability("v-1");
    db.metric.findFirst.mockResolvedValueOnce({ severity: "Medium" } as never);

    await createVulnerabilityRecord(ta3());

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    expect(data.severity).toBe("Medium");
  });

  it("clears the severity when no metric is rated", async () => {
    createsVulnerability("v-1");

    await createVulnerabilityRecord(ta3({ metrics: [] }));

    const [{ data }] = db.vulnerability.update.mock.calls[0];
    expect(data.severity).toBeNull();
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
      data: [
        {
          vulnerabilityId: "v-1",
          deviceGroupMatchingId: "m-3",
          status: "AFFECTED",
        },
      ],
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

describe("upsertSourceRecord", () => {
  const inbox = {
    source: "INBOX" as const,
    sourceId: "notif-1",
    metrics: [{ type: "CVSS_V3_1" as const, score: 7.5 }],
  };

  it("upserts the record on (source, sourceId, vulnerability), replaces its metrics and refreshes the vulnerability", async () => {
    db.metric.findFirst.mockResolvedValueOnce({ severity: "High" } as never);

    await upsertSourceRecord("vuln-1", inbox);

    expect(db.vulnerabilityRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source_sourceId_vulnerabilityId: {
            source: "INBOX",
            sourceId: "notif-1",
            vulnerabilityId: "vuln-1",
          },
        },
      }),
    );
    expect(db.metric.deleteMany).toHaveBeenCalledWith({
      where: { recordId: "rec-inbox" },
    });
    expect(db.metric.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recordId: "rec-inbox",
          type: "CVSS_V3_1",
          score: 7.5,
          severity: "High",
        }),
      ],
    });
    expect(db.vulnerability.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vuln-1" },
        data: expect.objectContaining({ severity: "High" }),
      }),
    );
  });
});
