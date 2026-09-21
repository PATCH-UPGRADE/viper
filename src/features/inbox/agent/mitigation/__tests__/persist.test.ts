// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockCreatePlans,
  mockAutomationUser,
  mockAssetIdsForMatchings,
  mockResolveDraftTarget,
} = vi.hoisted(() => ({
  mockPrisma: {
    mitigationPlan: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    notificationVulnerabilityMapping: { count: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
    deviceGroupMatching: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  mockCreatePlans: vi.fn(),
  mockAutomationUser: vi.fn(),
  mockAssetIdsForMatchings: vi.fn(),
  mockResolveDraftTarget: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/automation-user", () => ({
  getAutomationUser: mockAutomationUser,
}));
vi.mock("..", () => ({ createMitigationPlans: mockCreatePlans }));
vi.mock("@/features/work-orders/server/drafts", () => ({
  assetIdsForMatchings: mockAssetIdsForMatchings,
  resolveDraftTarget: mockResolveDraftTarget,
}));

import { persistMitigationPlans } from "../persist";

const VIPER_ONLY = {
  targetIntegrationId: null,
  submissionState: "NONE",
};

const FLEET = {
  targetIntegrationId: "int-fleet",
  platformPayload: { supportType: "technical" },
  submissionState: "PENDING",
};

const planWith = (
  matchingIds: string[],
  performedBy: "vendor" | "hospital" = "vendor",
) => ({
  title: "Segment the imaging VLAN",
  summary: "Cut the exposed path while the patch is scheduled.",
  compareLine: "Fastest to apply.",
  tags: [],
  cards: {},
  workOrders: [
    {
      shortDescription: "Patch the MAGNETOM firmware",
      detailedDescription: "Apply the vendor update.",
      performedBy,
      vulnerabilityIds: [],
      remediationIds: [],
      deviceGroups: matchingIds.map((id) => ({
        id,
        confidence: "Matched" as const,
        reasonWhy: null,
      })),
    },
  ],
});

/** The work order data that reached the nested create. */
const createdWorkOrder = () => {
  const [args] = mockPrisma.mitigationPlan.create.mock.calls[0];
  return args.data.workOrders.create[0];
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mitigationPlan.count.mockResolvedValue(0);
  mockPrisma.notificationVulnerabilityMapping.count.mockResolvedValue(1);
  mockPrisma.mitigationPlan.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.vulnerability.findMany.mockResolvedValue([]);
  mockPrisma.remediation.findMany.mockResolvedValue([]);
  mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([{ id: "m1" }]);
  mockAutomationUser.mockResolvedValue({ id: "automation" });
  mockAssetIdsForMatchings.mockResolvedValue(["a1"]);
  mockResolveDraftTarget.mockResolvedValue(VIPER_ONLY);
});

describe("persistMitigationPlans targeting", () => {
  it("stores the platform a draft will be filed on", async () => {
    mockCreatePlans.mockResolvedValue({ plans: [planWith(["m1"])] });
    mockResolveDraftTarget.mockResolvedValue(FLEET);

    await persistMitigationPlans("src-1", "notif-1");

    const workOrder = createdWorkOrder();
    expect(workOrder.targetIntegrationId).toBe("int-fleet");
    expect(workOrder.submissionState).toBe("PENDING");
    expect(workOrder.platformPayload).toEqual({ supportType: "technical" });
    expect(workOrder.isDraft).toBe(true);
  });

  // Who manages a device answers "who services this", not "who does this job".
  // An account audit the hospital runs on a vendor-serviced scanner is still
  // the hospital's work, and filing it would send the vendor a request for
  // something their engineer never does.
  it("never offers a platform to work the hospital performs", async () => {
    mockCreatePlans.mockResolvedValue({
      plans: [planWith(["m1"], "hospital")],
    });
    mockResolveDraftTarget.mockResolvedValue(FLEET);

    await persistMitigationPlans("src-1", "notif-1");

    // Not merely untargeted — the lookup never runs for hospital work.
    expect(mockResolveDraftTarget).not.toHaveBeenCalled();
    expect(mockAssetIdsForMatchings).not.toHaveBeenCalled();
    const workOrder = createdWorkOrder();
    expect(workOrder.targetIntegrationId).toBeUndefined();
    expect(workOrder.submissionState).toBeUndefined();
  });

  it("leaves a draft VIPER-only when no platform manages its assets", async () => {
    mockCreatePlans.mockResolvedValue({ plans: [planWith(["m1"])] });

    await persistMitigationPlans("src-1", "notif-1");

    const workOrder = createdWorkOrder();
    expect(workOrder.targetIntegrationId).toBeNull();
    expect(workOrder.submissionState).toBe("NONE");
    expect(workOrder.platformPayload).toBeUndefined();
  });

  // The target must be resolved from the matchings that actually survive, not
  // the ones the model named. A matching deleted since the notification arrived
  // would otherwise widen the asset set the target is chosen from.
  it("targets only the matchings that still exist", async () => {
    mockCreatePlans.mockResolvedValue({ plans: [planWith(["m1", "gone"])] });

    await persistMitigationPlans("src-1", "notif-1");

    expect(mockAssetIdsForMatchings).toHaveBeenCalledWith(mockPrisma, ["m1"]);
  });

  // Resolving inside the transaction would hold a pooled connection open across
  // several queries per work order.
  it("resolves every target before opening the transaction", async () => {
    mockCreatePlans.mockResolvedValue({ plans: [planWith(["m1"])] });
    let opened = false;
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      opened = true;
      return ops;
    });
    mockResolveDraftTarget.mockImplementation(async () => {
      expect(opened).toBe(false);
      return VIPER_ONLY;
    });

    await persistMitigationPlans("src-1", "notif-1");

    expect(mockResolveDraftTarget).toHaveBeenCalled();
  });

  it("does not run the agent once a plan has been accepted", async () => {
    mockPrisma.mitigationPlan.count.mockResolvedValue(1);

    await expect(persistMitigationPlans("src-1", "notif-1")).resolves.toEqual({
      skipped: "accepted-exists",
    });
    expect(mockCreatePlans).not.toHaveBeenCalled();
  });
});
