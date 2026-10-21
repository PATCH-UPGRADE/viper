// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ default: { deviceType: { findFirst } } }));

const { resolveDeviceType } = await import("../resolve-device-type");

const MRI = {
  id: "dt-mri",
  slug: "magnetic-resonance-imaging",
  displayName: "Magnetic Resonance Imaging (MRI)",
  nameMappings: [],
};

describe("resolveDeviceType", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findFirst.mockReset();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("matches the displayName first, case-insensitive, after a trim", async () => {
    findFirst.mockResolvedValueOnce(MRI);

    await expect(
      resolveDeviceType("  Magnetic Resonance Imaging (MRI) "),
    ).resolves.toBe(MRI);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        displayName: {
          equals: "magnetic resonance imaging (mri)",
          mode: "insensitive",
        },
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to nameMappings with the lowercase string", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(MRI);

    await expect(resolveDeviceType("MRI")).resolves.toBe(MRI);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { nameMappings: { has: "mri" } },
    });
  });

  it("returns null and warns with the context if nothing matches", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      resolveDeviceType("Syngo", { productName: "syngo.share" }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith("No device type matches", {
      name: "Syngo",
      productName: "syngo.share",
    });
  });

  it.each([null, undefined, "   "])(
    "returns null for %j without a query",
    async (name) => {
      await expect(resolveDeviceType(name)).resolves.toBeNull();
      expect(findFirst).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    },
  );
});
