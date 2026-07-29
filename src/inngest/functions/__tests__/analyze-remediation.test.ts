// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => {
  const prisma = {
    remediation: { findUnique: vi.fn() },
    vulnerability: { findUnique: vi.fn() },
    notificationSource: { findUnique: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn(), update: vi.fn() },
    notificationVulnerabilityMapping: { create: vi.fn() },
    notificationRemediationMapping: { create: vi.fn() },
    // Invoke the $transaction callback with the same mock so call assertions work.
    $transaction: vi.fn(
      // biome-ignore lint/suspicious/noExplicitAny: tx shape varies
      async (cb: (tx: any) => Promise<unknown>) => cb(prisma),
    ),
  };
  return { mockPrisma: prisma };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { Prisma } from "@/generated/prisma";
import { prepareRemediationNotification } from "../analyze-remediation";

const REMEDIATION_ID = "rem-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareRemediationNotification", () => {
  it("skips a remediation with no linked vulnerability", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue({
      id: REMEDIATION_ID,
      description: "d",
      narrative: "n",
      vulnerabilityId: null,
    });

    const result = await prepareRemediationNotification(REMEDIATION_ID);

    expect(result).toEqual({ skipped: "no-vulnerability" });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("creates a New Update notification, source, and both links", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue({
      id: REMEDIATION_ID,
      description: "Apply firmware v2",
      narrative: "How to apply",
      vulnerabilityId: "vuln-1",
    });
    mockPrisma.vulnerability.findUnique.mockResolvedValue({
      cveId: "CVE-2024-9999",
    });
    mockPrisma.notificationSource.findUnique.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-1" });
    mockPrisma.notificationSource.create.mockResolvedValue({ id: "src-1" });
    mockPrisma.notificationVulnerabilityMapping.create.mockResolvedValue({});
    mockPrisma.notificationRemediationMapping.create.mockResolvedValue({});

    const result = await prepareRemediationNotification(REMEDIATION_ID);

    expect(result).toEqual({ notificationId: "notif-1", sourceId: "src-1" });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "UpdateAvailable",
        title: expect.stringContaining("CVE-2024-9999"),
        summary: "Apply firmware v2",
      }),
    });
    expect(mockPrisma.notificationSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "PolledApi",
        externalId: REMEDIATION_ID,
        notificationId: "notif-1",
      }),
    });
    expect(
      mockPrisma.notificationVulnerabilityMapping.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationId: "notif-1",
        vulnerabilityId: "vuln-1",
        confidence: "Matched",
      }),
    });
    expect(
      mockPrisma.notificationRemediationMapping.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationId: "notif-1",
        remediationId: REMEDIATION_ID,
        confidence: "Matched",
      }),
    });
  });

  it("reuses the existing notification when the source already exists (idempotent)", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue({
      id: REMEDIATION_ID,
      description: "d",
      narrative: "n",
      vulnerabilityId: "vuln-1",
    });
    mockPrisma.vulnerability.findUnique.mockResolvedValue({
      cveId: "CVE-2024-9999",
    });
    mockPrisma.notificationSource.findUnique.mockResolvedValue({
      id: "src-1",
      notificationId: "notif-1",
    });

    const result = await prepareRemediationNotification(REMEDIATION_ID);

    expect(result).toEqual({ notificationId: "notif-1", sourceId: "src-1" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("recovers from a P2002 race by reusing the concurrently-created source", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue({
      id: REMEDIATION_ID,
      description: "d",
      narrative: "n",
      vulnerabilityId: "vuln-1",
    });
    mockPrisma.vulnerability.findUnique.mockResolvedValue({
      cveId: "CVE-2024-9999",
    });
    // Pre-transaction check finds nothing; the catch-branch recheck finds the
    // row a concurrent run committed between the check and our insert.
    mockPrisma.notificationSource.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "src-1", notificationId: "notif-1" });
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await prepareRemediationNotification(REMEDIATION_ID);

    expect(result).toEqual({ notificationId: "notif-1", sourceId: "src-1" });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
