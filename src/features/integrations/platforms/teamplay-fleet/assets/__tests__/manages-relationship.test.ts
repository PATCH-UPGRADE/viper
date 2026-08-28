// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  managesRelationship: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  externalAssetMapping: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/lib/router-utils", () => ({ resolveVendor: vi.fn() }));

import { resolveVendor } from "@/lib/router-utils";
import { connectUncontractedAssets } from "../manages-relationship";

const CONTRACTED = "asset-under-contract";
const UNCONTRACTED = "asset-without-contract";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveVendor).mockResolvedValue({ id: "vendor-1" } as Awaited<
    ReturnType<typeof resolveVendor>
  >);
  db.managesRelationship.findMany.mockResolvedValue([
    { assets: [{ id: CONTRACTED }] },
  ]);
  db.managesRelationship.findFirst.mockResolvedValue({
    id: "catch-all",
    assets: [],
  });
  db.externalAssetMapping.findMany.mockResolvedValue([
    { itemId: CONTRACTED },
    { itemId: UNCONTRACTED },
  ]);
});

describe("connectUncontractedAssets", () => {
  it("leaves an asset that already sits on a contract out of the catch-all, even when this run contracted nothing", async () => {
    await connectUncontractedAssets("int-1", new Set());

    expect(db.managesRelationship.update).toHaveBeenCalledWith({
      where: { id: "catch-all" },
      data: {
        assets: {
          connect: [{ id: UNCONTRACTED }],
          disconnect: [],
        },
      },
    });
  });

  it("pulls an asset back out of the catch-all once a contract covers it", async () => {
    db.managesRelationship.findFirst.mockResolvedValue({
      id: "catch-all",
      assets: [{ id: CONTRACTED }, { id: UNCONTRACTED }],
    });

    await connectUncontractedAssets("int-1", new Set());

    expect(db.managesRelationship.update).toHaveBeenCalledWith({
      where: { id: "catch-all" },
      data: {
        assets: {
          connect: [],
          disconnect: [{ id: CONTRACTED }],
        },
      },
    });
  });

  it("only counts contract-backed rows belonging to this vendor and integration", async () => {
    await connectUncontractedAssets("int-1", new Set());

    expect(db.managesRelationship.findMany).toHaveBeenCalledWith({
      where: {
        vendorId: "vendor-1",
        workOrderIntegrationId: "int-1",
        contract: { isNot: null },
      },
      select: { assets: { select: { id: true } } },
    });
  });

  it("writes nothing when every synced asset is already where it belongs", async () => {
    db.managesRelationship.findFirst.mockResolvedValue({
      id: "catch-all",
      assets: [{ id: UNCONTRACTED }],
    });

    await connectUncontractedAssets("int-1", new Set([CONTRACTED]));

    expect(db.managesRelationship.update).not.toHaveBeenCalled();
  });
});
