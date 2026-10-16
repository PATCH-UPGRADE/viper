// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { version: { updateMany: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/trpc/middleware", () => ({ requireExistence: vi.fn() }));

const { enrichVersionUdi } = await import("../utils");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.version.updateMany.mockResolvedValue({ count: 1 });
});

describe("enrichVersionUdi", () => {
  it("fills an empty udiDi, only on a version that an asset has", async () => {
    await enrichVersionUdi("v-1", "00843197100156");

    expect(mockPrisma.version.updateMany).toHaveBeenCalledWith({
      where: { id: "v-1", assets: { some: {} }, udiDi: null },
      data: { udiDi: "00843197100156" },
    });
  });

  it("skips a matching with no version", async () => {
    await enrichVersionUdi(null, "00843197100156");

    expect(mockPrisma.version.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the UDI on the version that already holds it", async () => {
    mockPrisma.version.updateMany.mockRejectedValue({ code: "P2002" });

    await expect(
      enrichVersionUdi("v-1", "00843197100156"),
    ).resolves.toBeUndefined();
  });
});
