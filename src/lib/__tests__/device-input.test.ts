// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    manufacturer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    product: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    version: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    deviceGroupMatching: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../tokens", () => ({ consumeUserToken: vi.fn() }));

const { deviceInputToAsset, devicesToMatchingConnect, resolveDeviceInput } =
  await import("../router-utils");
const { assetDeviceInputSchema, deviceInputSchema } = await import(
  "../schemas"
);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.manufacturer.findUnique.mockResolvedValue({ id: "m-1" });
  mockPrisma.product.findUnique.mockResolvedValue({
    id: "p-1",
    manufacturerId: "m-1",
  });
  mockPrisma.version.findUnique.mockResolvedValue({
    id: "v-1",
    productId: "p-1",
  });
  mockPrisma.manufacturer.findFirst.mockResolvedValue({ id: "m-1" });
  mockPrisma.product.findFirst.mockResolvedValue({ id: "p-1" });
  mockPrisma.version.findFirst.mockResolvedValue({ id: "v-1" });
});

describe("deviceInputSchema", () => {
  it("takes an id or a name for each part", () => {
    expect(
      deviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        product: { id: "p-1" },
        version: { range: "vers:semver/>=8.0" },
      }).success,
    ).toBe(true);
  });

  it("requires the version, so every version is an explicit range", () => {
    expect(
      deviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        product: { name: "Sigma" },
      }).success,
    ).toBe(false);
  });

  it("rejects a range that is not a VERS string", () => {
    expect(
      deviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        product: { name: "Sigma" },
        version: { range: ">=8.0" },
      }).success,
    ).toBe(false);
  });

  it("rejects a part with both an id and a name", () => {
    expect(
      deviceInputSchema.safeParse({
        manufacturer: { id: "m-1", name: "Baxter" },
      }).success,
    ).toBe(false);
  });

  it("requires the manufacturer", () => {
    expect(
      deviceInputSchema.safeParse({ product: { name: "Sigma" } }).success,
    ).toBe(false);
  });
});

describe("assetDeviceInputSchema", () => {
  it("takes a version status in place of a version", () => {
    expect(
      assetDeviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        version: { status: "UNSURE" },
      }).success,
    ).toBe(true);
  });

  it("rejects a version together with a status", () => {
    expect(
      assetDeviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        product: { name: "Sigma" },
        version: { name: "8.0", status: "UNKNOWN" },
      }).success,
    ).toBe(false);
  });

  it("rejects a status that only matchings can have", () => {
    expect(
      assetDeviceInputSchema.safeParse({
        manufacturer: { name: "Baxter" },
        version: { status: "KNOWN" },
      }).success,
    ).toBe(false);
  });
});

describe("resolveDeviceInput", () => {
  it("resolves ids without creating anything", async () => {
    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { id: "v-1" },
      }),
    ).resolves.toEqual({
      manufacturerId: "m-1",
      productId: "p-1",
      versionId: "v-1",
    });
    expect(mockPrisma.manufacturer.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(mockPrisma.version.create).not.toHaveBeenCalled();
  });

  it("creates a name that does not exist inside its parent", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.product.create.mockResolvedValue({ id: "p-new" });

    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        product: { name: "Sigma Spectrum" },
        version: { range: "vers:all/*" },
      }),
    ).resolves.toEqual({
      manufacturerId: "m-1",
      productId: "p-new",
      versionId: null,
    });
    expect(mockPrisma.product.create).toHaveBeenCalledWith({
      data: {
        manufacturerId: "m-1",
        canonicalName: "sigma spectrum",
        canonicalDisplayName: "Sigma Spectrum",
      },
    });
  });

  it("is a 404 for an unknown id", async () => {
    mockPrisma.version.findUnique.mockResolvedValue(null);

    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { id: "missing" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is a 400 for a product of another manufacturer", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: "p-2",
      manufacturerId: "m-other",
    });

    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        product: { id: "p-2" },
        version: { range: "vers:all/*" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is a 400 for a version of another product", async () => {
    mockPrisma.version.findUnique.mockResolvedValue({
      id: "v-2",
      productId: "p-other",
    });

    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { id: "v-2" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is a 400 for a version with no product", async () => {
    await expect(
      resolveDeviceInput({
        manufacturer: { id: "m-1" },
        version: { name: "8.0" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("deviceInputToAsset", () => {
  it("marks a resolved version KNOWN", async () => {
    await expect(
      deviceInputToAsset({
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { id: "v-1" },
      }),
    ).resolves.toMatchObject({ versionId: "v-1", versionStatus: "KNOWN" });
  });

  it("takes a version status in place of a version", async () => {
    await expect(
      deviceInputToAsset({
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { status: "UNSURE" },
      }),
    ).resolves.toMatchObject({ versionId: null, versionStatus: "UNSURE" });
  });

  it("takes a version status without a product", async () => {
    await expect(
      deviceInputToAsset({
        manufacturer: { id: "m-1" },
        version: { status: "UNKNOWN" },
      }),
    ).resolves.toMatchObject({
      productId: null,
      versionId: null,
      versionStatus: "UNKNOWN",
    });
  });

  it("leaves the device empty without a device input", async () => {
    await expect(deviceInputToAsset(undefined)).resolves.toEqual({
      manufacturerId: null,
      productId: null,
      versionId: null,
      versionStatus: "UNKNOWN",
    });
  });
});

describe("devicesToMatchingConnect", () => {
  it("connects one shared matching per distinct device", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue({ id: "dgm-1" });

    const connect = await devicesToMatchingConnect([
      {
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { range: "vers:all/*" },
      },
      {
        manufacturer: { name: "Acme" },
        product: { name: "X1" },
        version: { range: "vers:all/*" },
      },
    ]);

    expect(connect).toEqual([{ id: "dgm-1" }]);
    expect(mockPrisma.deviceGroupMatching.findFirst).toHaveBeenCalledWith({
      where: {
        manufacturerId: "m-1",
        productId: "p-1",
        versionId: null,
        versionRange: null,
      },
    });
  });

  it("stores a VERS range on the matching", async () => {
    mockPrisma.deviceGroupMatching.findFirst.mockResolvedValue({ id: "dgm-2" });

    await devicesToMatchingConnect([
      {
        manufacturer: { id: "m-1" },
        product: { id: "p-1" },
        version: { range: "vers:semver/>=8.0|<8.2" },
      },
    ]);

    expect(mockPrisma.deviceGroupMatching.findFirst).toHaveBeenCalledWith({
      where: {
        manufacturerId: "m-1",
        productId: "p-1",
        versionId: null,
        versionRange: "vers:semver/>=8.0|<8.2",
      },
    });
  });

  it("is a 400 for a range that does not parse", async () => {
    await expect(
      devicesToMatchingConnect([
        {
          manufacturer: { id: "m-1" },
          product: { id: "p-1" },
          version: { range: "vers:semver" },
        },
      ]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
