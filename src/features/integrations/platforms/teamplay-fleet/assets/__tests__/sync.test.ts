// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  integration: { findUniqueOrThrow: vi.fn() },
  asset: { findMany: vi.fn() },
  externalAssetMapping: { findMany: vi.fn() },
  product: { findUniqueOrThrow: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: vi.fn(),
}));
vi.mock("@/lib/router-utils", () => ({ resolveDeviceGroup: vi.fn() }));
vi.mock("@/features/device-types/server/apply-device-type", () => ({
  fillProductDeviceType: vi.fn(),
}));
vi.mock("@/features/device-types/server/resolve-device-type", () => ({
  resolveDeviceType: vi.fn(),
}));
vi.mock("../manages-relationship", () => ({
  connectUncontractedAssets: vi.fn(),
}));
vi.mock("../contracts", () => ({ syncFleetContracts: vi.fn() }));

import { fillProductDeviceType } from "@/features/device-types/server/apply-device-type";
import { resolveDeviceType } from "@/features/device-types/server/resolve-device-type";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { ResourceSyncCtx, Session } from "../../../../core/types";
import type { FleetConfig, FleetCreds } from "../../config";
import { syncFleetContracts } from "../contracts";
import { connectUncontractedAssets } from "../manages-relationship";
import { syncAssets } from "../sync";

const EQUIPMENT = {
  equipmentKey: "US_1006103273",
  serialNumber: "63014",
  productName: "syngo WebSpace",
  materialNumber: "10191201",
  modalityCode: "03",
  modalityTranslation: "Computed Tomography (CT)",
  softwareVersion: "VA11A",
  customerName: "SIEMENS DEMO/EVALUATION",
  street: "51 VALLEY STREAM PKWY",
  city: "MALVERN",
  state: "PA",
  zip: "19355",
  isActive: true,
};

const CARBON_PAIR = [
  {
    ...EQUIPMENT,
    equipmentKey: "US_1064970627",
    serialNumber: "100153",
    productName: "Syngo Carbon Gateway",
    softwareVersion: "VA16A",
  },
  {
    ...EQUIPMENT,
    equipmentKey: "US_1064970640",
    serialNumber: "100153",
    productName: "syngo Carbon Solution",
    softwareVersion: "VA34A",
  },
];

const okResponse = {
  message: "success",
  createdItemsCount: 1,
  updatedItemsCount: 0,
  shouldRetry: false,
  syncedAt: new Date(0).toISOString(),
};

const session: Session = {
  request: async () =>
    ({
      ok: true,
      json: async () => [EQUIPMENT, ...CARBON_PAIR],
    }) as unknown as Response,
};

const makeCtx = (
  overrides: Partial<ResourceSyncCtx<FleetConfig, FleetCreds>> = {},
): ResourceSyncCtx<FleetConfig, FleetCreds> => ({
  integrationId: "int-1",
  integrationUserId: "shadow-1",
  config: {},
  creds: { username: "svc@example.com", password: "pw" },
  session,
  cursor: null,
  lastSuccessfulSync: null,
  callback: async () => {
    throw new Error("fleet never uses the callback");
  },
  ...overrides,
});

beforeEach(() => {
  db.integration.findUniqueOrThrow.mockResolvedValue({
    integrationUserId: "shadow-1",
  });
  db.asset.findMany.mockReset().mockResolvedValue([]);
  // By default no Fleet asset is safe to re-group; individual tests opt in.
  db.externalAssetMapping.findMany.mockReset().mockResolvedValue([]);
  vi.mocked(processIntegrationSync).mockReset().mockResolvedValue(okResponse);
  vi.mocked(resolveDeviceGroup)
    .mockReset()
    .mockResolvedValue({ id: "dg-1", productId: "p-1" } as Awaited<
      ReturnType<typeof resolveDeviceGroup>
    >);
  db.product.findUniqueOrThrow
    .mockReset()
    .mockResolvedValue({ deviceTypeId: null });
  vi.mocked(fillProductDeviceType).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolveDeviceType)
    .mockReset()
    .mockResolvedValue({ id: "dt-ct" } as Awaited<
      ReturnType<typeof resolveDeviceType>
    >);
  vi.mocked(connectUncontractedAssets).mockReset().mockResolvedValue(undefined);
  vi.mocked(syncFleetContracts).mockReset().mockResolvedValue({
    contractedAssetIds: new Set(),
    errorMessage: null,
  });
});

const lastSyncCall = () => vi.mocked(processIntegrationSync).mock.calls[0];

describe("syncAssets", () => {
  it("ingests the mapped inventory under the shadow user", async () => {
    const outcome = await syncAssets(makeCtx());

    const [prismaArg, , input, userId, integrationId, resource] =
      lastSyncCall();
    expect(prismaArg).toBe(db);
    expect(input.items[0]).toMatchObject({
      externalId: "US_1006103273",
      serialNumber: "63014",
      productName: "syngo WebSpace",
      softwareVersion: "VA11A",
    });
    expect(userId).toBe("shadow-1");
    expect(integrationId).toBe("int-1");
    expect(resource).toBe(ResourceType.Asset);
    expect(connectUncontractedAssets).toHaveBeenCalledWith("int-1", new Set());
    expect(outcome).toEqual({ cursor: null });
  });

  it("derives the device group from Fleet's product and version names", async () => {
    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(resolveDeviceGroup).toHaveBeenCalledWith({
      manufacturer: "Siemens Healthineers",
      product: "syngo WebSpace",
      version: "VA11A",
      hasCpe: false,
    });
    expect(out.createData).toMatchObject({
      deviceGroupId: "dg-1",
      userId: "shadow-1",
    });
    expect(out.uniqueFieldConditions).toEqual([{ serialNumber: "63014" }]);
  });

  it("never writes Fleet's modality label into the asset role", async () => {
    db.externalAssetMapping.findMany.mockResolvedValue([
      { externalId: "US_1006103273" },
    ]);
    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.createData).not.toHaveProperty("role");
    expect(out.updateData).not.toHaveProperty("role");
  });

  it("re-groups an asset whose device group Fleet itself built", async () => {
    db.externalAssetMapping.findMany.mockResolvedValue([
      { externalId: "US_1006103273" },
    ]);

    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.updateData).toMatchObject({ deviceGroupId: "dg-1" });
  });

  it("leaves the device group alone when a CPE-derived group owns the asset", async () => {
    db.externalAssetMapping.findMany.mockResolvedValue([]);

    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.updateData).not.toHaveProperty("deviceGroupId");
  });

  it("only asks for assets sitting in a group with no CPE", async () => {
    await syncAssets(makeCtx());

    expect(db.externalAssetMapping.findMany).toHaveBeenCalledWith({
      where: {
        integrationId: "int-1",
        item: { deviceGroup: { cpe: { isEmpty: true } } },
      },
      select: { externalId: true },
    });
  });

  it("skips serial matching for a serial this integration already mapped", async () => {
    db.asset.findMany.mockResolvedValue([{ serialNumber: "63014" }]);

    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.uniqueFieldConditions).toEqual([]);
  });

  it("skips serial matching for serials shared inside the batch", async () => {
    await syncAssets(makeCtx());

    const [, config, input] = lastSyncCall();
    const gateway = input.items.find(
      (i: { externalId: string }) => i.externalId === "US_1064970627",
    );
    const out = await config.transformInputItem(
      gateway as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.uniqueFieldConditions).toEqual([]);
  });

  it("fails the attempt when any item failed, but still connects the mapped assets", async () => {
    vi.mocked(processIntegrationSync).mockResolvedValue({
      ...okResponse,
      shouldRetry: true,
      message: "3 of 123 items failed: boom",
    });

    await expect(syncAssets(makeCtx())).rejects.toThrow(
      "3 of 123 items failed: boom",
    );
    expect(connectUncontractedAssets).toHaveBeenCalledWith("int-1", new Set());
  });
  it("hands the contracted asset ids to the relationship step", async () => {
    vi.mocked(syncFleetContracts).mockResolvedValue({
      contractedAssetIds: new Set(["asset-1"]),
      errorMessage: null,
    });

    await syncAssets(makeCtx());

    expect(connectUncontractedAssets).toHaveBeenCalledWith(
      "int-1",
      new Set(["asset-1"]),
    );
  });

  it("still connects the mapped assets when the contracts pull fails", async () => {
    vi.mocked(syncFleetContracts).mockResolvedValue({
      contractedAssetIds: new Set(),
      errorMessage: "1 of 11 contracts failed: boom",
    });

    await expect(syncAssets(makeCtx())).rejects.toThrow(
      "1 of 11 contracts failed: boom",
    );
    expect(connectUncontractedAssets).toHaveBeenCalledWith("int-1", new Set());
  });
});

describe("product device type", () => {
  const transformAll = async (
    equipments: Record<string, unknown>[] = [EQUIPMENT],
  ) => {
    const ctx = makeCtx({
      session: {
        request: async () =>
          ({ ok: true, json: async () => equipments }) as unknown as Response,
      },
    });
    await syncAssets(ctx);
    const [, config, input] = lastSyncCall();
    for (const item of input.items) {
      await config.transformInputItem(
        item as Parameters<typeof config.transformInputItem>[0],
        "shadow-1",
      );
    }
  };

  it("fills an empty type from the modality label", async () => {
    await transformAll();

    expect(resolveDeviceType).toHaveBeenCalledWith("Computed Tomography (CT)", {
      integration: "teamplay Fleet",
      productName: "syngo WebSpace",
      materialNumber: "10191201",
      modalityCode: "03",
    });
    expect(fillProductDeviceType).toHaveBeenCalledWith("p-1", "dt-ct");
  });

  it("keeps a type that the product already has", async () => {
    db.product.findUniqueOrThrow.mockResolvedValue({
      deviceTypeId: "dt-viewer",
    });

    await transformAll();

    expect(resolveDeviceType).not.toHaveBeenCalled();
    expect(fillProductDeviceType).not.toHaveBeenCalled();
  });

  it("leaves the type empty if no device type matches", async () => {
    vi.mocked(resolveDeviceType).mockResolvedValue(null);

    await transformAll();

    expect(fillProductDeviceType).not.toHaveBeenCalled();
  });

  it("never types the shared product for records with no product name", async () => {
    await transformAll([{ ...EQUIPMENT, productName: null }]);

    expect(db.product.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(resolveDeviceType).not.toHaveBeenCalled();
  });

  it("checks each product one time in a sync", async () => {
    await transformAll([
      EQUIPMENT,
      { ...EQUIPMENT, equipmentKey: "US_2", serialNumber: "2" },
    ]);

    expect(db.product.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(resolveDeviceType).toHaveBeenCalledTimes(1);
  });

  it("uses a later record of the product if the first has no modality", async () => {
    await transformAll([
      { ...EQUIPMENT, modalityTranslation: null },
      { ...EQUIPMENT, equipmentKey: "US_2", serialNumber: "2" },
    ]);

    expect(resolveDeviceType).toHaveBeenCalledTimes(1);
    expect(resolveDeviceType).toHaveBeenCalledWith(
      "Computed Tomography (CT)",
      expect.anything(),
    );
  });

  it("accepts a numeric material number and modality code", async () => {
    await transformAll([
      { ...EQUIPMENT, materialNumber: 7129534, modalityCode: 3 },
    ]);

    expect(resolveDeviceType).toHaveBeenCalledWith(
      "Computed Tomography (CT)",
      expect.objectContaining({ materialNumber: "7129534", modalityCode: "3" }),
    );
  });
});
