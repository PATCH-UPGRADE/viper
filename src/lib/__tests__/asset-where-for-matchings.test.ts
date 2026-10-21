// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { version: { findMany: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { assetWhereForMatchings } from "../router-utils";

const matching = (fields: {
  productId?: string | null;
  versionId?: string | null;
  versionRange?: string | null;
}) => ({
  manufacturerId: "mf-1",
  productId: null,
  versionId: null,
  versionRange: null,
  ...fields,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.version.findMany.mockResolvedValue([
    { id: "v-1", canonicalName: "1.0" },
    { id: "v-2", canonicalName: "2.0" },
    { id: "v-3", canonicalName: "3.0" },
  ]);
});

describe("assetWhereForMatchings", () => {
  it("matches no asset with no matchings", async () => {
    expect(await assetWhereForMatchings([])).toEqual({ OR: [] });
  });

  it("puts an exact version and a whole product into SQL", async () => {
    const where = await assetWhereForMatchings([
      matching({ productId: "p-1", versionId: "v-2" }),
      matching({ productId: "p-2" }),
    ]);

    expect(where).toEqual({
      OR: [
        { manufacturerId: "mf-1", productId: "p-1", versionId: "v-2" },
        { manufacturerId: "mf-1", productId: "p-2" },
      ],
    });
    expect(mockPrisma.version.findMany).not.toHaveBeenCalled();
  });

  it("turns a VERS range into the product's versions in that range", async () => {
    const where = await assetWhereForMatchings([
      matching({ productId: "p-1", versionRange: "vers:semver/>=2.0" }),
    ]);

    expect(mockPrisma.version.findMany).toHaveBeenCalledWith({
      where: { productId: "p-1" },
      select: { id: true, canonicalName: true },
    });
    expect(where).toEqual({
      OR: [
        {
          manufacturerId: "mf-1",
          productId: "p-1",
          versionId: { in: ["v-2", "v-3"] },
        },
      ],
    });
  });

  it("matches no asset for a range that no version satisfies", async () => {
    const where = await assetWhereForMatchings([
      matching({ productId: "p-1", versionRange: "vers:semver/>=9.0" }),
    ]);

    expect(where).toEqual({ OR: [] });
  });

  it("treats a range that matches all versions as the whole product", async () => {
    const where = await assetWhereForMatchings([
      matching({ productId: "p-1", versionRange: "vers:all/*" }),
    ]);

    expect(where).toEqual({
      OR: [{ manufacturerId: "mf-1", productId: "p-1" }],
    });
    expect(mockPrisma.version.findMany).not.toHaveBeenCalled();
  });

  it("loose also takes the product's assets with no version", async () => {
    const where = await assetWhereForMatchings(
      [
        matching({ productId: "p-1", versionId: "v-2" }),
        matching({ productId: "p-2" }),
      ],
      { loose: true },
    );

    expect(where).toEqual({
      OR: [
        { manufacturerId: "mf-1", productId: "p-1", versionId: "v-2" },
        { manufacturerId: "mf-1", productId: "p-1", versionId: null },
        { manufacturerId: "mf-1", productId: "p-2" },
      ],
    });
  });
});
