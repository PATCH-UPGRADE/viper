// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  integration: { findUniqueOrThrow: vi.fn() },
  asset: { findMany: vi.fn() },
  externalAssetMapping: {},
}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: vi.fn(),
}));
vi.mock("@/lib/router-utils", () => ({ resolveDeviceGroup: vi.fn() }));
vi.mock("../session", () => ({ createFleetSession: vi.fn() }));
vi.mock("../manages-relationship", () => ({ connectManagedAssets: vi.fn() }));

import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { SyncCtx } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { connectManagedAssets } from "../manages-relationship";
import { createFleetSession } from "../session";
import { fleetSync } from "../sync";

const EQUIPMENT = {
  equipmentKey: "US_1006103273",
  serialNumber: "63014",
  productName: "syngo WebSpace",
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

const makeCtx = (
  overrides: Partial<SyncCtx<FleetConfig, FleetCreds>> = {},
): SyncCtx<FleetConfig, FleetCreds> => ({
  integrationId: "int-1",
  config: {},
  creds: {
    authType: "Basic",
    authentication: { username: "svc@example.com", password: "pw" },
  },
  resource: ResourceType.Asset,
  cursor: null,
  lastSuccessfulSync: null,
  callback: async () => {
    throw new Error("fleet never uses the callback");
  },
  ...overrides,
});

beforeEach(() => {
  vi.mocked(createFleetSession).mockResolvedValue({
    request: async () =>
      ({
        ok: true,
        json: async () => [EQUIPMENT, ...CARBON_PAIR],
      }) as unknown as Response,
  });
  db.integration.findUniqueOrThrow.mockResolvedValue({
    integrationUserId: "shadow-1",
  });
  db.asset.findMany.mockReset().mockResolvedValue([]);
  vi.mocked(processIntegrationSync).mockReset().mockResolvedValue(okResponse);
  vi.mocked(resolveDeviceGroup)
    .mockReset()
    .mockResolvedValue({ id: "dg-1" } as Awaited<
      ReturnType<typeof resolveDeviceGroup>
    >);
  vi.mocked(connectManagedAssets).mockReset().mockResolvedValue(undefined);
});

const lastSyncCall = () => vi.mocked(processIntegrationSync).mock.calls[0];

describe("fleetSync", () => {
  it("refuses resources it has no module for", async () => {
    await expect(
      fleetSync(makeCtx({ resource: ResourceType.WorkOrder })),
    ).rejects.toThrow("teamplay Fleet has no WorkOrder sync yet");
    expect(processIntegrationSync).not.toHaveBeenCalled();
  });

  it("ingests the mapped inventory under the shadow user", async () => {
    const outcome = await fleetSync(makeCtx());

    const [prismaArg, , input, userId, integrationId, resource] =
      lastSyncCall();
    expect(prismaArg).toBe(db);
    expect(input.items[0]).toMatchObject({
      vendorId: "US_1006103273",
      serialNumber: "63014",
      productName: "syngo WebSpace",
      softwareVersion: "VA11A",
    });
    expect(userId).toBe("shadow-1");
    expect(integrationId).toBe("int-1");
    expect(resource).toBe(ResourceType.Asset);
    expect(connectManagedAssets).toHaveBeenCalledWith("int-1");
    expect(outcome).toEqual({ cursor: null });
  });

  it("derives the device group from names on create, never on update", async () => {
    await fleetSync(makeCtx());

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
    expect(out.updateData).not.toHaveProperty("deviceGroupId");
    expect(out.uniqueFieldConditions).toEqual([{ serialNumber: "63014" }]);
  });

  it("skips serial matching for a serial this integration already mapped", async () => {
    db.asset.findMany.mockResolvedValue([{ serialNumber: "63014" }]);

    await fleetSync(makeCtx());

    const [, config, input] = lastSyncCall();
    const out = await config.transformInputItem(
      input.items[0] as Parameters<typeof config.transformInputItem>[0],
      "shadow-1",
    );
    expect(out.uniqueFieldConditions).toEqual([]);
  });

  it("skips serial matching for serials shared inside the batch", async () => {
    await fleetSync(makeCtx());

    const [, config, input] = lastSyncCall();
    const gateway = input.items.find(
      (i: { vendorId: string }) => i.vendorId === "US_1064970627",
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

    await expect(fleetSync(makeCtx())).rejects.toThrow(
      "3 of 123 items failed: boom",
    );
    expect(connectManagedAssets).toHaveBeenCalledWith("int-1");
  });
});
