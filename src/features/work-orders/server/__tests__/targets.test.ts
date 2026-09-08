// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    managesRelationship: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { resolveWorkOrderTargets } from "../targets";

const fleet = {
  responsibilities: "Serviced by Siemens Healthineers.",
  vendor: { canonicalDisplayName: "Siemens Healthineers" },
  department: null,
  workOrderIntegration: {
    id: "int-fleet",
    name: "teamplay Fleet",
    platform: "FLEET",
  },
};

const asset = (id: string, hostname: string, externalId?: string) => ({
  id,
  hostname,
  ip: "10.0.0.1",
  externalMappings: externalId
    ? [{ integrationId: "int-fleet", externalId }]
    : [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.findMany.mockResolvedValue([]);
});

describe("resolveWorkOrderTargets", () => {
  it("groups assets under the integration that files for them", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      {
        ...fleet,
        assets: [asset("a1", "MR-1", "US_1"), asset("a2", "CT-1", "US_2")],
      },
    ]);

    const { targets, unmanaged } = await resolveWorkOrderTargets(["a1", "a2"]);

    expect(unmanaged).toEqual([]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      integrationId: "int-fleet",
      platform: "FLEET",
      managedBy: "Siemens Healthineers",
    });
    expect(targets[0].assets.map((a) => a.externalId)).toEqual([
      "US_1",
      "US_2",
    ]);
  });

  it("merges two relationships that name the same platform", async () => {
    // A vendor contract and a department arrangement can both point at one
    // integration. The asset must not appear twice.
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      { ...fleet, assets: [asset("a1", "MR-1", "US_1")] },
      {
        ...fleet,
        vendor: null,
        department: { name: "Radiology" },
        assets: [asset("a1", "MR-1", "US_1"), asset("a2", "CT-1", "US_2")],
      },
    ]);

    const { targets } = await resolveWorkOrderTargets(["a1", "a2"]);

    expect(targets).toHaveLength(1);
    expect(targets[0].assets.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("names an asset no platform files for, without failing", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      { ...fleet, assets: [asset("a1", "MR-1", "US_1")] },
    ]);
    mockPrisma.asset.findMany.mockResolvedValue([
      { id: "a9", hostname: "PUMP-1", ip: "10.0.0.9" },
    ]);

    const { targets, unmanaged } = await resolveWorkOrderTargets(["a1", "a9"]);

    expect(targets[0].assets.map((a) => a.id)).toEqual(["a1"]);
    expect(unmanaged).toEqual([{ id: "a9", label: "PUMP-1" }]);
  });

  it("reports a null external id when the asset was never synced", async () => {
    // The platform still manages it, but has no id of its own for it yet.
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      { ...fleet, assets: [asset("a1", "MR-1")] },
    ]);

    const { targets } = await resolveWorkOrderTargets(["a1"]);

    expect(targets[0].assets[0].externalId).toBeNull();
  });

  it("names ids with no asset behind them, so a caller need not parse labels", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([]);
    // Only one of the two ids resolves to a row.
    mockPrisma.asset.findMany.mockResolvedValue([
      { id: "a1", hostname: "MR-1", ip: "10.0.0.1" },
    ]);

    const { unknownIds, unmanaged } = await resolveWorkOrderTargets([
      "a1",
      "ghost",
    ]);

    expect(unknownIds).toEqual(["ghost"]);
    expect(unmanaged.map((u) => u.id)).toEqual(["a1", "ghost"]);
  });

  it("does no work for an empty request", async () => {
    const result = await resolveWorkOrderTargets([]);

    expect(result).toEqual({ targets: [], unmanaged: [], unknownIds: [] });
    expect(mockPrisma.managesRelationship.findMany).not.toHaveBeenCalled();
  });
});
