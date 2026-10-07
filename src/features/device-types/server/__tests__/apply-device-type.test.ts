// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  deviceType: { findMany: vi.fn() },
  product: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

const {
  deviceTypeIdsBySlug,
  fillProductDeviceType,
  prepareDeviceTypeSlugs,
  setProductDeviceType,
} = await import("../apply-device-type");

beforeEach(() => {
  db.deviceType.findMany.mockReset().mockResolvedValue([
    { id: "dt-pump", slug: "infusion-pump" },
    { id: "dt-monitor", slug: "patient-monitor" },
  ]);
  db.product.updateMany.mockReset().mockResolvedValue({ count: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("deviceTypeIdsBySlug", () => {
  it("skips the query if no slug is given", async () => {
    await expect(deviceTypeIdsBySlug([undefined, null])).resolves.toEqual(
      new Map(),
    );
    expect(db.deviceType.findMany).not.toHaveBeenCalled();
  });

  it("maps each distinct slug to its id", async () => {
    const ids = await deviceTypeIdsBySlug(["infusion-pump", "infusion-pump"]);

    expect(ids.get("infusion-pump")).toBe("dt-pump");
    expect(db.deviceType.findMany).toHaveBeenCalledWith({
      where: { slug: { in: ["infusion-pump"] } },
      select: { id: true, slug: true },
    });
  });

  it("throws BAD_REQUEST with every unknown slug", async () => {
    await expect(
      deviceTypeIdsBySlug(["infusion-pump", "pumpp", "monitr"]),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Unknown deviceType: pumpp, monitr",
    });
  });
});

describe("prepareDeviceTypeSlugs", () => {
  it("rejects an unknown slug before it returns a writer", async () => {
    await expect(prepareDeviceTypeSlugs(["pumpp"])).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("writes a product's type one time for repeated slugs", async () => {
    const apply = await prepareDeviceTypeSlugs(["infusion-pump"]);

    await apply("p-1", "infusion-pump");
    await apply("p-1", "infusion-pump");

    expect(db.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("writes again when the slug for a product changes", async () => {
    const apply = await prepareDeviceTypeSlugs([
      "infusion-pump",
      "patient-monitor",
    ]);

    await apply("p-1", "infusion-pump");
    await apply("p-1", "patient-monitor");
    await apply("p-1", "infusion-pump");

    expect(
      db.product.updateMany.mock.calls.map(([arg]) => arg.data.deviceTypeId),
    ).toEqual(["dt-pump", "dt-monitor", "dt-pump"]);
  });

  it("does nothing with no slug or no product", async () => {
    const apply = await prepareDeviceTypeSlugs(["infusion-pump"]);

    await apply("p-1", undefined);
    await apply("p-1", null);
    await apply(null, "infusion-pump");

    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
});

describe("setProductDeviceType", () => {
  it("overwrites the type, except on the shared unknown product", async () => {
    await setProductDeviceType("p-1", "dt-pump");

    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", canonicalName: { not: "-" } },
      data: { deviceTypeId: "dt-pump" },
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns if the product is the shared unknown product", async () => {
    db.product.updateMany.mockResolvedValue({ count: 0 });

    await setProductDeviceType("p-unknown", "dt-pump");

    expect(console.warn).toHaveBeenCalled();
  });
});

describe("fillProductDeviceType", () => {
  it("sets only an empty type, and never on the shared unknown product", async () => {
    await fillProductDeviceType("p-1", "dt-pump");

    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", deviceTypeId: null, canonicalName: { not: "-" } },
      data: { deviceTypeId: "dt-pump" },
    });
  });
});
