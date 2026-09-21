// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockRequirePlatform } = vi.hoisted(() => ({
  mockPrisma: {
    deviceGroupMatching: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    managesRelationship: { findMany: vi.fn() },
  },
  mockRequirePlatform: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/integrations/core/registry", () => ({
  requirePlatform: mockRequirePlatform,
}));

import { assetIdsForMatchings, resolveDraftTarget } from "../drafts";

/** Prisma's delegate types are too precise to satisfy with a bare mock. */
const db = mockPrisma as unknown as Parameters<typeof assetIdsForMatchings>[0];

/** Every field defaulted, which is what makes a bare draft fileable. */
const payloadSchema = z.object({
  supportType: z.enum(["technical", "application"]).default("technical"),
  dangerForPatient: z.enum(["yes", "no", "unknown"]).default("unknown"),
});

const fleetModule = { payloadSchema, assertSubmittable: undefined };

const relationship = (integrationId: string, assetIds: string[]) => ({
  responsibilities: "Serviced by Siemens Healthineers.",
  vendor: { canonicalDisplayName: "Siemens Healthineers" },
  department: null,
  workOrderIntegration: {
    id: integrationId,
    name: `Platform ${integrationId}`,
    platform: "FLEET",
  },
  assets: assetIds.map((id) => ({
    id,
    hostname: id,
    ip: null,
    externalMappings: [{ integrationId, externalId: `eq-${id}` }],
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.findMany.mockResolvedValue([]);
  mockPrisma.managesRelationship.findMany.mockResolvedValue([]);
  mockRequirePlatform.mockReturnValue({ workOrders: fleetModule });
});

describe("assetIdsForMatchings", () => {
  const matching = {
    manufacturerId: "man-1",
    productId: "prod-1",
    versionId: null,
    versionRange: "vers:semver/>=2.0.0",
  };

  const candidate = (id: string, version: string) => ({
    id,
    deviceGroup: {
      id: `dg-${id}`,
      manufacturerId: "man-1",
      productId: "prod-1",
      versionId: null,
      version: { canonicalName: version },
    },
  });

  it("returns nothing for no matchings", async () => {
    await expect(assetIdsForMatchings(db, [])).resolves.toEqual([]);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
  });

  // The SQL `where` narrows to manufacturer and product only. A version range
  // cannot be expressed there, so an asset outside the range still comes back
  // from the database and has to be dropped in memory.
  it("drops a candidate the version range excludes", async () => {
    mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([matching]);
    mockPrisma.asset.findMany.mockResolvedValue([
      candidate("a1", "2.5"),
      candidate("a2", "1.0"),
    ]);

    await expect(assetIdsForMatchings(db, ["m1"])).resolves.toEqual(["a1"]);
  });

  it("returns nothing when the matchings no longer exist", async () => {
    mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([]);

    await expect(assetIdsForMatchings(db, ["m1"])).resolves.toEqual([]);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
  });
});

describe("resolveDraftTarget", () => {
  it("targets the one platform that can file for the assets", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      relationship("int-fleet", ["a1", "a2"]),
    ]);

    const target = await resolveDraftTarget(["a1", "a2"]);

    expect(target.targetIntegrationId).toBe("int-fleet");
    expect(target.submissionState).toBe("PENDING");
    // The platform's own defaults, so a draft that names no fields is fileable.
    expect(target.platformPayload).toEqual({
      supportType: "technical",
      dangerForPatient: "unknown",
    });
  });

  it("tracks in VIPER when nobody manages the assets", async () => {
    const target = await resolveDraftTarget(["a1"]);

    expect(target.targetIntegrationId).toBeNull();
    expect(target.submissionState).toBe("NONE");
    expect(target.platformPayload).toBeUndefined();
  });

  // One work order files to one platform. An order spanning two vendors cannot
  // be sent without splitting it, and a partial filing would send less than the
  // approver agreed to.
  it("tracks in VIPER when the assets span two platforms", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      relationship("int-fleet", ["a1"]),
      relationship("int-other", ["a2"]),
    ]);

    const target = await resolveDraftTarget(["a1", "a2"]);

    expect(target.targetIntegrationId).toBeNull();
    expect(target.submissionState).toBe("NONE");
  });

  // The same partial filing, from the other direction: the order would reach the
  // vendor naming a device they do not service, and the approver was shown one
  // order covering every asset.
  it("tracks in VIPER when the platform covers only part of the set", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      relationship("int-fleet", ["a1"]),
    ]);
    mockPrisma.asset.findMany.mockResolvedValue([
      { id: "a2", hostname: "scanner-2", ip: null },
    ]);

    const target = await resolveDraftTarget(["a1", "a2"]);

    expect(target.targetIntegrationId).toBeNull();
    expect(target.submissionState).toBe("NONE");
  });

  it("tracks in VIPER when the platform cannot file at all", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      relationship("int-fleet", ["a1"]),
    ]);
    mockRequirePlatform.mockReturnValue({ workOrders: null });

    const target = await resolveDraftTarget(["a1"]);

    expect(target.targetIntegrationId).toBeNull();
  });

  // A module free to refuse the defaults must not fail the draft: the plan is
  // still worth creating, VIPER just tracks it.
  it("tracks in VIPER when the platform refuses its own defaults", async () => {
    mockPrisma.managesRelationship.findMany.mockResolvedValue([
      relationship("int-fleet", ["a1"]),
    ]);
    mockRequirePlatform.mockReturnValue({
      workOrders: {
        payloadSchema,
        assertSubmittable: () => {
          throw new Error("Report this by phone.");
        },
      },
    });

    const target = await resolveDraftTarget(["a1"]);

    expect(target.targetIntegrationId).toBeNull();
    expect(target.submissionState).toBe("NONE");
  });

  it("does not query at all for an empty asset list", async () => {
    await resolveDraftTarget([]);

    expect(mockPrisma.managesRelationship.findMany).not.toHaveBeenCalled();
  });
});
