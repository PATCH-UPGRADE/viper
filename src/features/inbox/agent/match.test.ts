// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, recordInboxCvss } = vi.hoisted(() => {
  const prisma = {
    notificationDeviceGroupMapping: {
      upsert: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationVulnerabilityMapping: {
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    vulnerability: { findUnique: vi.fn().mockResolvedValue(null) },
    deviceGroupMatching: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    notificationRemediationMapping: { upsert: vi.fn() },
    remediation: { findUnique: vi.fn(), update: vi.fn() },
    // applyDecisions runs inside prisma.$transaction(async (tx) => …) — invoke
    // the callback with the same mock so call assertions still work.
    // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
    $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
      cb(prisma),
    ),
  };
  return { mockPrisma: prisma, recordInboxCvss: vi.fn() };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/router-utils", () => ({ resolveMatchingId: vi.fn() }));
vi.mock("../utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils")>()),
  recordInboxCvss,
}));

import { notRejected } from "../types";
import type { Candidates } from "./candidate-search";
import { applyDecisions, type Decision } from "./match";

const candidates: Candidates = {
  deviceGroups: [
    {
      extracted: {
        manufacturer: "Acme",
        modelName: "X1",
        version: null,
      },
      matches: [
        {
          id: "dg-1",
          manufacturer: "Acme",
          modelName: "X1",
          version: null,
          versionRange: null,
        },
      ],
    },
  ],
  vulnerabilities: [],
  remediations: [],
  assets: [],
};

const linkDecision: Decision = {
  kind: "deviceGroupMatching",
  op: "link",
  targetId: "dg-1",
  confidence: "Matched",
  reasonWhy: "same manufacturer + model",
  fields: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyDecisions — device-group mapping owner", () => {
  it("links to a work order via the workOrderTicketId compound key", async () => {
    const summary = await applyDecisions(
      { workOrderTicketId: "wo-1" },
      [linkDecision],
      candidates,
    );

    expect(summary.linked).toBe(1);
    expect(
      mockPrisma.notificationDeviceGroupMapping.upsert,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockPrisma.notificationDeviceGroupMapping.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workOrderTicketId_deviceGroupMatchingId: {
            workOrderTicketId: "wo-1",
            deviceGroupMatchingId: "dg-1",
          },
        },
        create: expect.objectContaining({
          workOrderTicketId: "wo-1",
          deviceGroupMatchingId: "dg-1",
          confidence: "Matched",
        }),
      }),
    );
  });

  it("links to a notification via the notificationId compound key", async () => {
    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [linkDecision],
      candidates,
    );

    expect(summary.linked).toBe(1);
    expect(
      mockPrisma.notificationDeviceGroupMapping.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          notificationId_deviceGroupMatchingId: {
            notificationId: "n-1",
            deviceGroupMatchingId: "dg-1",
          },
        },
        create: expect.objectContaining({
          notificationId: "n-1",
          deviceGroupMatchingId: "dg-1",
        }),
      }),
    );
  });

  it("skips link decisions whose targetId wasn't a surfaced candidate", async () => {
    const summary = await applyDecisions(
      { workOrderTicketId: "wo-1" },
      [{ ...linkDecision, targetId: "hallucinated" }],
      candidates,
    );

    expect(summary).toMatchObject({ linked: 0, skipped: 1 });
    expect(
      mockPrisma.notificationDeviceGroupMapping.upsert,
    ).not.toHaveBeenCalled();
  });
});

describe("applyDecisions — device-group update adds a versionRange", () => {
  const updateDecision: Decision = {
    ...linkDecision,
    op: "update",
    fields: { versionRange: "vers:semver/<2.0.0" },
  };

  beforeEach(() => {
    mockPrisma.deviceGroupMatching.findUnique.mockResolvedValue({
      versionRange: null,
      manufacturerId: "m-1",
      productId: "p-1",
      versionId: null,
      versionStatus: "UNKNOWN",
    });
  });

  it("adds the range when no other matching has the ranged identity", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue(null);

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [updateDecision],
      candidates,
    );

    expect(summary.updated).toBe(1);
    expect(mockPrisma.deviceGroupMatching.update).toHaveBeenCalledWith({
      where: { id: "dg-1" },
      data: { versionRange: "vers:semver/<2.0.0", versionStatus: "KNOWN" },
    });
  });

  it("leaves the matching alone when the ranged identity already exists", async () => {
    // The identity is unique, so updating would throw P2002 and abort the
    // transaction.
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue({
      id: "dg-ranged",
    });

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [updateDecision],
      candidates,
    );

    expect(summary.updated).toBe(1);
    expect(mockPrisma.deviceGroupMatching.findFirst).toHaveBeenCalledWith({
      where: {
        manufacturerId: "m-1",
        productId: "p-1",
        versionId: null,
        versionRange: "vers:semver/<2.0.0",
        versionStatus: "KNOWN",
      },
      select: { id: true },
    });
    expect(mockPrisma.deviceGroupMatching.update).not.toHaveBeenCalled();
    expect(
      mockPrisma.notificationDeviceGroupMapping.upsert,
    ).toHaveBeenCalledTimes(1);
  });

  it("turns an UNKNOWN matching KNOWN for a range of every version", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue(null);

    await applyDecisions(
      { notificationId: "n-1" },
      [{ ...updateDecision, fields: { versionRange: "vers:all/*" } }],
      candidates,
    );

    expect(mockPrisma.deviceGroupMatching.update).toHaveBeenCalledWith({
      where: { id: "dg-1" },
      data: { versionRange: null, versionStatus: "KNOWN" },
    });
  });

  it("leaves a KNOWN matching alone for a range of every version", async () => {
    mockPrisma.deviceGroupMatching.findUnique.mockResolvedValue({
      versionRange: null,
      manufacturerId: "m-1",
      productId: "p-1",
      versionId: null,
      versionStatus: "KNOWN",
    });

    await applyDecisions(
      { notificationId: "n-1" },
      [{ ...updateDecision, fields: { versionRange: "vers:all/*" } }],
      candidates,
    );

    expect(mockPrisma.deviceGroupMatching.update).not.toHaveBeenCalled();
  });
});

describe("applyDecisions — vulnerability mapping", () => {
  const vulnCandidates: Candidates = {
    ...candidates,
    vulnerabilities: [
      {
        extracted: { cveId: "CVE-2026-0001" },
        matches: [
          {
            id: "vuln-1",
            displayId: "CVE-2026-0001",
            description: null,
            cvssScore: null,
            cvssVector: null,
          },
        ],
      },
    ],
  };
  const vulnDecision: Decision = {
    kind: "vulnerability",
    op: "link",
    targetId: "vuln-1",
    confidence: "Matched",
    reasonWhy: "same CVE",
    fields: null,
  };

  it("creates a link when the notification has none", async () => {
    mockPrisma.notificationVulnerabilityMapping.updateMany.mockResolvedValue({
      count: 0,
    });
    mockPrisma.notificationVulnerabilityMapping.createMany.mockResolvedValue({
      count: 1,
    });

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [vulnDecision],
      vulnCandidates,
    );

    expect(summary).toMatchObject({ linked: 1, skipped: 0 });
    expect(
      mockPrisma.notificationVulnerabilityMapping.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: "n-1",
          vulnerabilityId: "vuln-1",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("updates an existing link that is not rejected", async () => {
    mockPrisma.notificationVulnerabilityMapping.updateMany.mockResolvedValue({
      count: 1,
    });

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [vulnDecision],
      vulnCandidates,
    );

    expect(summary).toMatchObject({ linked: 1, skipped: 0 });
    expect(
      mockPrisma.notificationVulnerabilityMapping.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        notificationId: "n-1",
        vulnerabilityId: "vuln-1",
        ...notRejected,
      },
      data: { confidence: "Matched", reasonWhy: "same CVE" },
    });
    expect(
      mockPrisma.notificationVulnerabilityMapping.createMany,
    ).not.toHaveBeenCalled();
  });

  it("skips a vulnerability that a user rejected on this notification", async () => {
    // A rejected row matches neither write: the update filters it out, and the
    // create sees a duplicate.
    mockPrisma.notificationVulnerabilityMapping.updateMany.mockResolvedValue({
      count: 0,
    });
    mockPrisma.notificationVulnerabilityMapping.createMany.mockResolvedValue({
      count: 0,
    });

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [vulnDecision],
      vulnCandidates,
    );

    expect(summary).toMatchObject({ linked: 0, skipped: 1 });
    expect(recordInboxCvss).not.toHaveBeenCalled();
  });

  it("keeps the CVSS an update decision found, once the transaction has committed", async () => {
    mockPrisma.notificationVulnerabilityMapping.updateMany.mockResolvedValue({
      count: 1,
    });
    const order: string[] = [];
    mockPrisma.$transaction.mockImplementationOnce(async (cb) => {
      const result = await cb(mockPrisma);
      order.push("commit");
      return result;
    });
    recordInboxCvss.mockImplementationOnce(async () => {
      order.push("cvss");
    });

    const summary = await applyDecisions(
      { notificationId: "n-1" },
      [
        {
          ...vulnDecision,
          op: "update",
          fields: { cvssScore: 8.2, cvssVector: "CVSS:3.1/AV:N" },
        },
      ],
      vulnCandidates,
    );

    expect(summary).toMatchObject({ updated: 1 });
    expect(recordInboxCvss).toHaveBeenCalledWith({
      vulnerabilityId: "vuln-1",
      notificationId: "n-1",
      cvssScore: 8.2,
      cvssVector: "CVSS:3.1/AV:N",
    });
    expect(order).toEqual(["commit", "cvss"]);
  });
});

describe("applyDecision - remediation impact", () => {
  const NURSE_CALL = {
    phase: "DURING_APPLY",
    feature: "nurse call button",
    effect: "UNAVAILABLE",
  } as const;

  const remCandidates: Candidates = {
    ...candidates,
    remediations: [
      {
        extracted: {
          description: "Bedside monitor software update",
          impact: {
            requiresDowntime: true,
            estimatedDowntimeSeconds: 600,
            impacts: [NURSE_CALL],
          },
        },
        matches: [
          {
            id: "rem-1",
            linkedCveIds: [],
            description: "update",
            statedImpactFields: [],
          },
        ],
      },
    ],
  };
  const updateDecision: Decision = {
    kind: "remediation",
    op: "update",
    targetId: "rem-1",
    extractedIndex: 1,
    confidence: "Matched",
    reasonWhy: "same update",
    fields: null,
  };
  const stored = (over: Record<string, unknown> = {}, impactRows = 0) => ({
    mechanism: null,
    requiresDowntime: null,
    restartRequired: null,
    estimatedDUrationSeconds: null,
    estimatedDowntimeSeconds: null,
    disablesFeatures: null,
    reversible: null,
    verificationRequired: null,
    verificationNotes: null,
    _count: { impacts: impactRows },
    ...over,
  });

  it("fills impact fields and rows that are still empty", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue(stored());
    const summary = await applyDecisions(
      { notificationId: "notif-1" },
      [updateDecision],
      remCandidates,
    );
    expect(summary.updated).toBe(1);
    expect(mockPrisma.remediation.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: {
        requiresDowntime: true,
        estimatedDowntimeSeconds: 600,
        impacts: { deleteMany: {}, create: [NURSE_CALL] },
      },
    });
  });
  it("never overwrites a stated value or existing rows", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue(
      stored({ requiresDowntime: false }, 1),
    );
    await applyDecisions(
      { notificationId: "notif-1" },
      [updateDecision],
      remCandidates,
    );
    expect(mockPrisma.remediation.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { estimatedDowntimeSeconds: 600 },
    });
  });
  it("writes nothing when every field is already stated", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue(
      stored({ requiresDowntime: false, estimatedDowntimeSeconds: 900 }, 1),
    );
    await applyDecisions(
      { notificationId: "notif-1" },
      [updateDecision],
      remCandidates,
    );
    expect(mockPrisma.remediation.update).not.toHaveBeenCalled();
  });

  it("ignores an extractedIndex whose candidates do not include the target", async () => {
    const wrongIndex = {
      ...remCandidates,
      remediations: [
        ...remCandidates.remediations,
        {
          extracted: { impact: { restartRequired: true } },
          matches: [
            {
              id: "rem-2",
              linkedCveIds: [],
              description: null,
              statedImpactFields: [],
            },
          ],
        },
      ],
    };

    await applyDecisions(
      { notificationId: "notif-1" },
      [{ ...updateDecision, extractedIndex: 2 }],
      wrongIndex,
    );
    expect(mockPrisma.remediation.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.remediation.update).not.toHaveBeenCalled();
  });

  it("still writes a new description when nothing about impact is stated", async () => {
    await applyDecisions(
      { notificationId: "notif-1" },
      [
        {
          ...updateDecision,
          extractedIndex: null,
          fields: { description: "Apply update 4.2" },
        },
      ],
      remCandidates,
    );
    expect(mockPrisma.remediation.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.remediation.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { description: "Apply update 4.2" },
    });
  });
  it("does not touch impact on a link decision", async () => {
    await applyDecisions(
      { notificationId: "notif-1" },
      [{ ...updateDecision, op: "link" }],
      remCandidates,
    );
    expect(
      mockPrisma.notificationRemediationMapping.upsert,
    ).toHaveBeenCalledTimes(1);
    expect(mockPrisma.remediation.update).not.toHaveBeenCalled();
  });
});
