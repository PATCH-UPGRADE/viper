// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => {
  const prisma = {
    notification: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    fieldCorrection: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(
      // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
      async (cb: (tx: any) => Promise<unknown>) => cb(prisma),
    ),
  };
  return { mockPrisma: prisma };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/automation-user", () => ({
  getAutomationUser: vi.fn().mockResolvedValue({ id: "viper-automation" }),
}));

import { persistTriageResult } from "./persist";

const result = {
  priority: "Critical" as const,
  priorityReasonWhy: "Attackers are already using this flaw.",
  hospitalImpact: {
    byline: "b",
    impactStatement: "i",
    careAreas: "",
    likelihood: "l",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findUniqueOrThrow.mockResolvedValue({
    priority: "Unsorted",
  });
});

describe("persistTriageResult", () => {
  it("writes the three triage columns onto the notification", async () => {
    await persistTriageResult("n1", result);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: {
        priority: "Critical",
        priorityReasonWhy: result.priorityReasonWhy,
        hospitalImpact: result.hospitalImpact,
      },
    });
  });

  it("records the AI's priority change as a field correction by the automation user", async () => {
    await persistTriageResult("n1", result);

    expect(mockPrisma.fieldCorrection.createMany).toHaveBeenCalledWith({
      data: [
        {
          targetType: "Notification",
          targetId: "n1",
          field: "priority",
          fromValue: "Unsorted",
          toValue: "Critical",
          reason: result.priorityReasonWhy,
          userId: "viper-automation",
        },
      ],
    });
  });

  it("records nothing when triage keeps the same priority", async () => {
    mockPrisma.notification.findUniqueOrThrow.mockResolvedValue({
      priority: "Critical",
    });

    await persistTriageResult("n1", result);

    expect(mockPrisma.fieldCorrection.createMany).not.toHaveBeenCalled();
  });
});
