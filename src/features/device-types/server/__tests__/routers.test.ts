// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  deviceType: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  asset: { count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

const { countAssetsByDeviceType } = await import("../routers");

const product = (deviceTypeId: string | null, assets: number) => ({
  deviceTypeId,
  _count: { assets },
});

beforeEach(() => {
  db.deviceType.findMany.mockReset().mockResolvedValue([
    { id: "dt-ct", slug: "computed-tomography", displayName: "CT" },
    { id: "dt-pump", slug: "infusion-pump", displayName: "Infusion Pump" },
    { id: "dt-vent", slug: "ventilator", displayName: "Ventilator" },
  ]);
  db.product.findMany.mockReset().mockResolvedValue([]);
  db.asset.count.mockReset().mockResolvedValue(0);
});

describe("countAssetsByDeviceType", () => {
  it("sums the assets of every product of a type", async () => {
    db.product.findMany.mockResolvedValue([
      product("dt-pump", 20),
      product("dt-pump", 3),
      product("dt-ct", 1),
    ]);

    const { items } = await countAssetsByDeviceType();

    expect(items).toEqual([
      { slug: "computed-tomography", displayName: "CT", assetCount: 1 },
      { slug: "infusion-pump", displayName: "Infusion Pump", assetCount: 23 },
      { slug: "ventilator", displayName: "Ventilator", assetCount: 0 },
    ]);
  });

  it("counts assets whose product has no type, or no product, as untyped", async () => {
    db.product.findMany.mockResolvedValue([
      product(null, 4),
      product("dt-ct", 1),
    ]);
    db.asset.count.mockResolvedValue(2);

    const { untypedAssetCount } = await countAssetsByDeviceType();

    expect(untypedAssetCount).toBe(6);
  });

  it("counts every asset but a decommissioned one, also with no status", async () => {
    await countAssetsByDeviceType();

    const counted = {
      OR: [{ status: null }, { status: { not: "Decommissioned" } }],
    };
    const [{ select }] = db.product.findMany.mock.calls[0];
    expect(select._count.select.assets.where).toEqual(counted);
    expect(db.asset.count).toHaveBeenCalledWith({
      where: { ...counted, productId: null },
    });
  });
});
