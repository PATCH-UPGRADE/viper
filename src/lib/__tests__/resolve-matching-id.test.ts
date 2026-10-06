// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    manufacturer: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
    version: { findFirst: vi.fn() },
    deviceGroupMatching: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/trpc/middleware", () => ({ requireExistence: vi.fn() }));
vi.mock("../tokens", () => ({ consumeUserToken: vi.fn() }));

const { resolveMatchingId } = await import("../router-utils");

const input = { manufacturer: "Acme", product: "X1", version: "1.0" };
const identity = {
  manufacturerId: "m-1",
  productId: "p-1",
  versionId: "v-1",
  versionRange: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.manufacturer.findFirst.mockResolvedValue({ id: "m-1" });
  mockPrisma.product.findFirst.mockResolvedValue({ id: "p-1" });
  mockPrisma.version.findFirst.mockResolvedValue({ id: "v-1" });
});

describe("resolveMatchingId", () => {
  it("returns the existing matching without creating one", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue({ id: "dgm-1" });

    await expect(resolveMatchingId(input)).resolves.toBe("dgm-1");
    expect(mockPrisma.deviceGroupMatching.findFirst).toHaveBeenCalledWith({
      where: identity,
    });
    expect(mockPrisma.deviceGroupMatching.create).not.toHaveBeenCalled();
  });

  it("creates the matching when none exists", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue(null);
    mockPrisma.deviceGroupMatching.create.mockResolvedValue({ id: "dgm-new" });

    await expect(resolveMatchingId(input)).resolves.toBe("dgm-new");
    expect(mockPrisma.deviceGroupMatching.create).toHaveBeenCalledWith({
      data: identity,
    });
  });

  // The identity is unique (device_group_matching_identity_key), so a
  // concurrent create that loses the race throws P2002.
  it("re-reads the winner's row when it loses the create race", async () => {
    mockPrisma.deviceGroupMatching.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dgm-winner" });
    mockPrisma.deviceGroupMatching.create.mockRejectedValue({ code: "P2002" });

    await expect(resolveMatchingId(input)).resolves.toBe("dgm-winner");
    expect(mockPrisma.deviceGroupMatching.findFirst).toHaveBeenCalledTimes(2);
  });

  it("rethrows errors that aren't a lost race", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue(null);
    const error = { code: "P2003" };
    mockPrisma.deviceGroupMatching.create.mockRejectedValue(error);

    await expect(resolveMatchingId(input)).rejects.toBe(error);
  });
});
