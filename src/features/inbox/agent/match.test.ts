// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => {
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
    deviceGroupMatching: { findUnique: vi.fn(), update: vi.fn() },
    // applyDecisions runs inside prisma.$transaction(async (tx) => …) — invoke
    // the callback with the same mock so call assertions still work.
    // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
    $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
      cb(prisma),
    ),
  };
  return { mockPrisma: prisma };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/router-utils", () => ({ resolveMatchingId: vi.fn() }));

import { notRejected } from "../types";
import type { Candidates } from "./candidate-search";
import { applyDecisions, type Decision } from "./match";

const candidates: Candidates = {
  deviceGroups: [
    {
      extracted: {
        cpe: null,
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

describe("applyDecisions — vulnerability mapping", () => {
  const vulnCandidates: Candidates = {
    ...candidates,
    vulnerabilities: [
      {
        extracted: { cveId: "CVE-2026-0001" },
        matches: [
          {
            id: "vuln-1",
            cveId: "CVE-2026-0001",
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
    expect(mockPrisma.vulnerability.findUnique).not.toHaveBeenCalled();
  });
});
