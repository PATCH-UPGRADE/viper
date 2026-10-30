// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  deviceType: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  asset: { count: vi.fn() },
  deviceGuide: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

const { countAssetsByDeviceType, getDeviceGuides } = await import("../routers");

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
  db.deviceGuide.findMany.mockResolvedValue([]);
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

describe("getDeviceGuides", () => {
  beforeEach(() => {
    db.deviceType.findMany.mockResolvedValue([]);
  });
  it("returns each device type with its general text, or null without one", async () => {
    db.deviceType.findMany.mockResolvedValue([
      {
        id: "dt-ct",
        displayName: "CT",
        guides: [{ body: "Takes quick pictures" }],
      },
      { id: "dt-fw", displayName: "Firewall", guides: [] },
    ]);
    const { deviceTypes } = await getDeviceGuides({
      deviceTypeIds: ["dt-ct", "dtfw"],
      productIds: [],
    });

    expect(deviceTypes).toEqual([
      {
        id: "dt-ct",
        displayName: "CT",
        generalText: "Takes quick pictures",
      },
      { id: "dt-fw", displayName: "Firewall", generalText: null },
    ]);
  });

  it("reads the given device types and only their typical-usage guides", async () => {
    await getDeviceGuides({ deviceTypeIds: ["dt-ct"], productIds: [] });
    const [{ where, select }] = db.deviceType.findMany.mock.calls[0];
    expect(where).toEqual({ id: { in: ["dt-ct"] } });
    expect(select.guides.where).toEqual({ topic: "TYPICAL_USAGE" });
  });

  it("skips the product query when there are no product ids", async () => {
    const { productGuides } = await getDeviceGuides({
      deviceTypeIds: ["dt-ct"],
      productIds: [],
    });
    expect(db.deviceGuide.findMany).not.toHaveBeenCalled();
    expect(productGuides).toEqual([]);
  });

  it("returns the product-specific guides of the given products", async () => {
    const guide = { productId: "p-gotop", body: "Main CT for the ED" };
    db.deviceGuide.findMany.mockResolvedValue([guide]);

    const { productGuides } = await getDeviceGuides({
      deviceTypeIds: [],
      productIds: ["p-gotop", "p-sola"],
    });

    expect(db.deviceGuide.findMany).toHaveBeenCalledWith({
      where: {
        topic: "TYPICAL_USAGE",
        productId: { in: ["p-gotop", "p-sola"] },
      },
      select: { productId: true, body: true },
    });
    expect(productGuides).toEqual([guide]);
  });
});
