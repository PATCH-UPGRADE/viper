// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = {
  asset: { findUnique: vi.fn() },
  deviceGroupMatching: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const { matchingIdsForAsset } = await import("../routers");

const deviceGroup = (over: Record<string, unknown> = {}) => ({
  id: "dg-1",
  manufacturerId: "mfr-1",
  productId: "prod-1",
  versionId: "ver-1",
  version: { canonicalName: "6.0.2" },
  ...over,
});

const matching = (over: Record<string, unknown> = {}) => ({
  id: "match-1",
  manufacturerId: "mfr-1",
  productId: "prod-1",
  versionId: null,
  versionRange: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.asset.findUnique.mockResolvedValue({ deviceGroup: deviceGroup() });
  prismaMock.deviceGroupMatching.findMany.mockResolvedValue([matching()]);
});

describe("matchingIdsForAsset", () => {
  it("matches a rule naming the same manufacturer and product", async () => {
    expect(await matchingIdsForAsset("asset-1")).toEqual(["match-1"]);
  });

  it("matches a manufacturer-wide rule, where the product is a wildcard", async () => {
    prismaMock.deviceGroupMatching.findMany.mockResolvedValue([
      matching({ id: "wildcard", productId: null }),
    ]);
    expect(await matchingIdsForAsset("asset-1")).toEqual(["wildcard"]);
  });

  it("matches a rule whose VERS range covers the installed version", async () => {
    prismaMock.deviceGroupMatching.findMany.mockResolvedValue([
      matching({ id: "in-range", versionRange: "vers:semver/<=6.0.2" }),
    ]);
    expect(await matchingIdsForAsset("asset-1")).toEqual(["in-range"]);
  });

  it("drops a rule whose VERS range excludes the installed version", async () => {
    prismaMock.deviceGroupMatching.findMany.mockResolvedValue([
      matching({ id: "out-of-range", versionRange: "vers:semver/<=5.0.0" }),
    ]);
    expect(await matchingIdsForAsset("asset-1")).toEqual([]);
  });

  it("narrows the query to the manufacturer, and to the product or its wildcard", async () => {
    await matchingIdsForAsset("asset-1");

    expect(prismaMock.deviceGroupMatching.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          manufacturerId: "mfr-1",
          OR: [{ productId: null }, { productId: "prod-1" }],
        },
      }),
    );
  });

  it("matches nothing for an asset with no device group", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ deviceGroup: null });
    expect(await matchingIdsForAsset("asset-1")).toEqual([]);
    expect(prismaMock.deviceGroupMatching.findMany).not.toHaveBeenCalled();
  });

  it("matches nothing when the device group has no manufacturer", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      deviceGroup: deviceGroup({ manufacturerId: null }),
    });
    expect(await matchingIdsForAsset("asset-1")).toEqual([]);
  });

  it("matches nothing for an asset that does not exist", async () => {
    prismaMock.asset.findUnique.mockResolvedValue(null);
    expect(await matchingIdsForAsset("asset-1")).toEqual([]);
  });
});
