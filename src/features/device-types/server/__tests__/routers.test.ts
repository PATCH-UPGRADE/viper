// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  deviceType: { findMany: vi.fn() },
  deviceGroup: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

const { countAssetsByDeviceType } = await import("../routers");

const group = (deviceTypeId: string | null, assets: number) => ({
  product: { deviceTypeId },
  _count: { assets },
});

beforeEach(() => {
  db.deviceType.findMany.mockReset().mockResolvedValue([
    { id: "dt-ct", slug: "computed-tomography", displayName: "CT" },
    { id: "dt-pump", slug: "infusion-pump", displayName: "Infusion Pump" },
    { id: "dt-vent", slug: "ventilator", displayName: "Ventilator" },
  ]);
  db.deviceGroup.findMany.mockReset();
});

describe("countAssetsByDeviceType", () => {
  it("sums the assets of every device group of a type", async () => {
    db.deviceGroup.findMany.mockResolvedValue([
      group("dt-pump", 20),
      group("dt-pump", 3),
      group("dt-ct", 1),
    ]);

    const { items } = await countAssetsByDeviceType();

    expect(items).toEqual([
      { slug: "computed-tomography", displayName: "CT", assetCount: 1 },
      { slug: "infusion-pump", displayName: "Infusion Pump", assetCount: 23 },
      { slug: "ventilator", displayName: "Ventilator", assetCount: 0 },
    ]);
  });

  it("counts assets whose product has no type, or no product, as untyped", async () => {
    db.deviceGroup.findMany.mockResolvedValue([
      group(null, 4),
      { product: null, _count: { assets: 2 } },
      group("dt-ct", 1),
    ]);

    const { untypedAssetCount } = await countAssetsByDeviceType();

    expect(untypedAssetCount).toBe(6);
  });

  it("counts every asset but a decommissioned one, also with no status", async () => {
    db.deviceGroup.findMany.mockResolvedValue([]);

    await countAssetsByDeviceType();

    const [{ select }] = db.deviceGroup.findMany.mock.calls[0];
    expect(select._count.select.assets.where).toEqual({
      OR: [{ status: null }, { status: { not: "Decommissioned" } }],
    });
  });
});
