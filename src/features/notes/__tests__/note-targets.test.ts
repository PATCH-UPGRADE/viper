import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import { findDeviceGroupMatching } from "../server/note-targets";

vi.mock("@/lib/db", () => ({
  default: {
    deviceGroupMatching: { findFirst: vi.fn(), findMany: vi.fn() },
    manufacturer: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/router-utils", () => {
  const normalizeName = (name: string) => name.trim().toLocaleLowerCase();
  return {
    normalizeName,
    canonicalNameWhere: (name: string) => {
      const canonicalName = normalizeName(name);
      return {
        OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
      };
    },
    nameOrClauses: (term: string) => [
      { canonicalName: { contains: term, mode: "insensitive" } },
      { canonicalDisplayName: { contains: term, mode: "insensitive" } },
      { nameMappings: { has: normalizeName(term) } },
    ],
    resolveMatchingId: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findDeviceGroupMatching", () => {
  it("returns the id of an exact match", async () => {
    vi.mocked(prisma.deviceGroupMatching.findFirst).mockResolvedValue({
      id: "dgm_1",
    } as never);

    const result = await findDeviceGroupMatching(
      {
        manufacturerName: "Baxter",
        productName: "Sigma Spectrum",
        versionRange: "vers:semver/<8.8",
      },
      { create: false },
    );

    expect(prisma.deviceGroupMatching.findFirst).toHaveBeenCalledWith({
      where: {
        manufacturer: {
          OR: [
            { canonicalName: "baxter" },
            { nameMappings: { has: "baxter" } },
          ],
        },
        product: {
          OR: [
            { canonicalName: "sigma spectrum" },
            { nameMappings: { has: "sigma spectrum" } },
          ],
        },
        versionId: null,
        versionRange: "vers:semver/<8.8",
      },
      select: { id: true },
    });

    expect(result).toEqual({ found: true, id: "dgm_1" });
    expect(prisma.deviceGroupMatching.findMany).not.toHaveBeenCalled();
  });

  it("reports an unknown manufacturer and refuses to create", async () => {
    vi.mocked(prisma.deviceGroupMatching.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.manufacturer.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deviceGroupMatching.findMany).mockResolvedValue([]);

    const result = await findDeviceGroupMatching(
      { manufacturerName: "syngo.plaza" },
      { create: true },
    );
    expect(result).toEqual({
      found: false,
      unknownName: "manufacturer",
      relatedMatchings: [],
    });
    expect(resolveMatchingId).not.toHaveBeenCalled();
  });

  it("creates the matching when create is true and nothing matches", async () => {
    vi.mocked(prisma.deviceGroupMatching.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.manufacturer.findFirst).mockResolvedValue({
      id: "mfr",
    } as never);
    vi.mocked(prisma.product.findFirst).mockResolvedValue({
      id: "prod",
    } as never);
    vi.mocked(resolveMatchingId).mockResolvedValue("dgm_new");

    const result = await findDeviceGroupMatching(
      {
        manufacturerName: "Baxter",
        productName: "Sigma Spectrum",
        versionRange: "vers:semver/<8.0",
      },
      { create: true },
    );

    expect(resolveMatchingId).toHaveBeenCalledWith({
      manufacturer: "Baxter",
      product: "Sigma Spectrum",
      version: null,
      versionRange: "vers:semver/<8.0",
      hasCpe: false,
    });
    expect(result).toEqual({ found: true, id: "dgm_new" });
    expect(prisma.deviceGroupMatching.findMany).not.toHaveBeenCalled();
  });
});
