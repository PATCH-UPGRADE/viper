// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    asset: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/integrations/core/registry", () => ({
  displayNameFor: (platform: string) =>
    platform === "PARTNER" ? "Partner API" : platform,
}));

import type { MatchKeysRow } from "../../contract";
import { loadCanonicalNames, loadMatchContext } from "../context";

const keysRow = (overrides: Partial<MatchKeysRow>): MatchKeysRow => ({
  rowNumber: 2,
  manufacturer: "GE Healthcare",
  product: "CARESCAPE B650",
  serialNumber: null,
  macAddress: null,
  hostname: null,
  ...overrides,
});

const monitorRow = {
  id: "mon-1",
  ip: "10.20.4.11",
  hostname: null,
  macAddress: null,
  serialNumber: "GE-CB-2021-118",
  networkSegment: null,
  role: "Patient monitor",
  status: null,
  location: { facility: "Main", street: "51 Valley Stream" },
  deviceGroup: {
    manufacturer: { canonicalDisplayName: "GE HealthCare" },
    product: { canonicalDisplayName: "CARESCAPE B650" },
  },
  externalMappings: [
    { integration: { platform: "PARTNER" } },
    { integration: { platform: "PARTNER" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.findMany.mockResolvedValue([]);
  mockPrisma.manufacturer.findMany.mockResolvedValue([]);
  mockPrisma.product.findMany.mockResolvedValue([]);
});

describe("loadMatchContext", () => {
  it("looks up serials, MAC addresses and the hostnames of keyless rows in one query", async () => {
    await loadMatchContext([
      keysRow({ rowNumber: 2, serialNumber: "S-1", hostname: "ignored-host" }),
      keysRow({ rowNumber: 3, macAddress: "00:1A:2B:3C:4D:5E" }),
      keysRow({ rowNumber: 4, hostname: "ws-icu-01" }),
      keysRow({ rowNumber: 5, serialNumber: "S-1" }),
    ]);

    expect(mockPrisma.asset.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.asset.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { serialNumber: { in: ["S-1"] } },
        { macAddress: { in: ["00:1A:2B:3C:4D:5E"] } },
        { hostname: { in: ["ws-icu-01"] } },
      ],
    });
  });

  it("skips the query when no row has a key", async () => {
    const context = await loadMatchContext([keysRow({})]);

    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
    expect(context.assets.size).toBe(0);
  });

  it("leaves out devices this import added, but not the ones it linked", async () => {
    await loadMatchContext([keysRow({ serialNumber: "S-1" })], {
      excludeAssetsAddedByImportId: "imp-1",
    });

    expect(mockPrisma.asset.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ serialNumber: { in: ["S-1"] } }],
      NOT: { id: { startsWith: "imp-1r" } },
    });
  });

  it("labels a device by manufacturer, model and role, and names each reporting platform once", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([monitorRow]);

    const context = await loadMatchContext([
      keysRow({ serialNumber: "GE-CB-2021-118" }),
    ]);

    expect(context.assets.get("mon-1")).toMatchObject({
      label: "GE HealthCare CARESCAPE B650 · Patient monitor",
      platforms: ["Partner API"],
      serialNumber: "GE-CB-2021-118",
      location: { facility: "Main", street: "51 Valley Stream" },
    });
  });

  it("falls back to the asset's display name when its group has no names", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      {
        ...monitorRow,
        deviceGroup: { manufacturer: null, product: null },
      },
    ]);

    const context = await loadMatchContext([
      keysRow({ serialNumber: "GE-CB-2021-118" }),
    ]);

    expect(context.assets.get("mon-1")?.label).toBe("10.20.4.11");
  });
});

describe("loadCanonicalNames", () => {
  it("maps each name matched to an existing one onto that name's canonical spelling", async () => {
    mockPrisma.manufacturer.findMany.mockResolvedValue([
      { id: "mfr-ge", canonicalName: "gehealthcare" },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "prd-lq", canonicalName: "logiq e" },
    ]);

    const canonicalNames = await loadCanonicalNames({
      manufacturers: {
        "ge healthcare": { kind: "existing", id: "mfr-ge" },
        "acme biomedical": { kind: "new" },
      },
      products: {
        "ge healthcare::logiq e": { kind: "existing", id: "prd-lq" },
      },
    });

    expect(mockPrisma.manufacturer.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["mfr-ge"] },
    });
    expect(canonicalNames.manufacturers).toEqual(
      new Map([["ge healthcare", "gehealthcare"]]),
    );
    expect(canonicalNames.products).toEqual(
      new Map([["ge healthcare::logiq e", "logiq e"]]),
    );
  });

  it("skips both queries when every name is new", async () => {
    const canonicalNames = await loadCanonicalNames({
      manufacturers: { "acme biomedical": { kind: "new" } },
      products: {},
    });

    expect(mockPrisma.manufacturer.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    expect(canonicalNames.manufacturers.size).toBe(0);
  });
});
