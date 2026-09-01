// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    integration: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import {
  listFleetManagedAssets,
  resolveFleetAssets,
  UnmanagedAssetsError,
  workOrderIntegration,
} from "../managed-assets";

const FLEET_INTEGRATION = {
  id: "int-fleet",
  resourceSyncs: [{ resource: "WorkOrder" }],
};

// An asset row as returned with the Fleet mapping included.
const managedAsset = (id: string, hostname: string, equipmentKey: string) => ({
  id,
  hostname,
  ip: "10.40.1.60",
  role: "MRI Scanner",
  externalMappings: [{ externalId: equipmentKey }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.integration.findMany.mockResolvedValue([FLEET_INTEGRATION]);
});

describe("listFleetManagedAssets", () => {
  it("returns assets mapped to Fleet, keyed by their equipment", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
    ]);

    const assets = await listFleetManagedAssets();

    expect(assets).toEqual([
      {
        assetId: "a1",
        hostname: "MR-MAGNETOM-001",
        ip: "10.40.1.60",
        role: "MRI Scanner",
        equipmentKey: "US_1064669350",
      },
    ]);
  });

  it("returns nothing when no Fleet integration is configured", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([]);
    expect(await listFleetManagedAssets()).toEqual([]);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
  });
});

describe("resolveFleetAssets", () => {
  it("resolves Siemens-managed assets to their equipment keys", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
    ]);

    const resolved = await resolveFleetAssets(["a1"]);
    expect(resolved.map((a) => a.equipmentKey)).toEqual(["US_1064669350"]);
  });

  it("refuses an asset Siemens does not manage, naming it by hostname", async () => {
    // Only the MRI is Fleet-managed; the infusion pump is not.
    mockPrisma.asset.findMany
      .mockResolvedValueOnce([
        managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
      ])
      // The lookup that labels the rejected ids.
      .mockResolvedValueOnce([
        { id: "a2", hostname: "PUMP-SIGMA-001", ip: "10.20.4.101" },
      ]);

    const error = await resolveFleetAssets(["a1", "a2"]).catch((e) => e);

    expect(error).toBeInstanceOf(UnmanagedAssetsError);
    expect(error.message).toMatch(/PUMP-SIGMA-001/);
  });
});

describe("workOrderIntegration", () => {
  it("prefers the integration that syncs work orders (the sync dedups against it)", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: "int-asset", resourceSyncs: [{ resource: "Asset" }] },
      { id: "int-wo", resourceSyncs: [{ resource: "WorkOrder" }] },
    ]);

    const integration = await workOrderIntegration();
    expect(integration.id).toBe("int-wo");
  });

  it("throws when a Fleet integration exists but none syncs work orders", async () => {
    // The equipment-sync integration must not be used to file work orders —
    // that would break the /activities dedup.
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: "int-asset", resourceSyncs: [{ resource: "Asset" }] },
    ]);

    await expect(workOrderIntegration()).rejects.toThrow(
      /No Siemens Healthineers Fleet integration/,
    );
  });

  it("throws when no Fleet integration is configured", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([]);
    await expect(workOrderIntegration()).rejects.toThrow(
      /No Siemens Healthineers Fleet integration/,
    );
  });
});
