// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { asset: {}, externalAssetMapping: {} },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: vi.fn(),
}));
vi.mock("@/lib/router-utils", () => ({ resolveDeviceGroup: vi.fn() }));

import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import { resolveDeviceGroup } from "@/lib/router-utils";
import type { RowOutcome, StagedRow } from "../../contract";
import { type ApplyChunkInput, applyChunk } from "../apply";
import type { ContextAsset } from "../match-rows";

const stagedRow = (overrides: Partial<StagedRow> = {}): StagedRow => ({
  rowNumber: 2,
  role: "Ultrasound",
  manufacturer: "GE Healthcare",
  product: "LOGIQ e",
  version: "R7",
  serialNumber: "GE-LQ-2019-001",
  ip: "10.40.1.30",
  macAddress: null,
  hostname: "us-bay-1",
  networkSegment: null,
  status: null,
  facility: null,
  building: "Imaging Department",
  floor: null,
  room: "Ultrasound Bay 1",
  raw: [],
  ...overrides,
});

const ultrasound: ContextAsset = {
  id: "rad-us-001",
  label: "GE HealthCare LOGIQ e · Ultrasound",
  platforms: ["Partner API"],
  serialNumber: "GE-LQ-2019-001",
  macAddress: null,
  hostname: null,
  ip: "10.9.9.9",
  networkSegment: null,
  role: null,
  status: null,
  location: { facility: "Main Campus", street: "51 Valley Stream" },
};

const chunkInput = (
  rows: StagedRow[],
  outcomes: RowOutcome[],
  overrides: Partial<ApplyChunkInput> = {},
): ApplyChunkInput => ({
  integrationId: "int-csv",
  userId: "user-uploader",
  rows,
  outcomes,
  context: { assets: new Map([[ultrasound.id, ultrasound]]) },
  canonicalNames: { manufacturers: new Map(), products: new Map() },
  ...overrides,
});

const writtenOk = {
  message: "success",
  createdItemsCount: 1,
  updatedItemsCount: 0,
  shouldRetry: false,
  syncedAt: new Date(0).toISOString(),
};

const engineCall = (index = 0) =>
  vi.mocked(processIntegrationSync).mock.calls[index];

const transformedItem = async (index = 0) => {
  const [, config, engineInput, userId] = engineCall(index);
  return config.transformInputItem(engineInput.items[0], userId);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(processIntegrationSync).mockResolvedValue(writtenOk);
  vi.mocked(resolveDeviceGroup).mockResolvedValue({ id: "dg-logiq" } as Awaited<
    ReturnType<typeof resolveDeviceGroup>
  >);
});

describe("applyChunk — adding a device", () => {
  it("creates it under a fresh id, owned by the uploader, mapped as csv:<id>", async () => {
    const result = await applyChunk(
      chunkInput([stagedRow()], [{ kind: "add", rowNumber: 2 }]),
    );

    const [prismaArg, , engineInput, userId, integrationId, resource] =
      engineCall();
    const written = await transformedItem();
    const newAssetId = written.createData.id;
    expect(prismaArg).toBe(mockPrisma);
    expect(userId).toBe("user-uploader");
    expect(integrationId).toBe("int-csv");
    expect(resource).toBe(ResourceType.Asset);
    expect(newAssetId).toEqual(expect.any(String));
    expect(engineInput.items[0].vendorId).toBe(`csv:${newAssetId}`);
    expect(written.uniqueFieldConditions).toEqual([]);
    expect(result).toEqual({ added: 1, linked: 0, failures: [] });
  });

  it("writes every filled field and leaves empty cells out", async () => {
    await applyChunk(
      chunkInput([stagedRow()], [{ kind: "add", rowNumber: 2 }]),
    );

    const written = await transformedItem();
    expect(written.createData).toEqual({
      id: expect.any(String),
      role: "Ultrasound",
      serialNumber: "GE-LQ-2019-001",
      ip: "10.40.1.30",
      hostname: "us-bay-1",
      location: { building: "Imaging Department", room: "Ultrasound Bay 1" },
      deviceGroupId: "dg-logiq",
      userId: "user-uploader",
    });
  });

  it("groups it under the canonical names the user chose", async () => {
    await applyChunk(
      chunkInput([stagedRow()], [{ kind: "add", rowNumber: 2 }], {
        canonicalNames: {
          manufacturers: new Map([["ge healthcare", "gehealthcare"]]),
          products: new Map([["ge healthcare::logiq e", "logiq e"]]),
        },
      }),
    );
    await transformedItem();

    expect(resolveDeviceGroup).toHaveBeenCalledWith({
      manufacturer: "gehealthcare",
      product: "logiq e",
      version: "R7",
      hasCpe: false,
    });
  });

  it("keeps the file's spelling for a name the user marked new", async () => {
    await applyChunk(
      chunkInput(
        [
          stagedRow({
            manufacturer: "Acme Biomedical",
            product: "ThermaFlo 200",
          }),
        ],
        [{ kind: "add", rowNumber: 2 }],
      ),
    );
    await transformedItem();

    expect(resolveDeviceGroup).toHaveBeenCalledWith({
      manufacturer: "Acme Biomedical",
      product: "ThermaFlo 200",
      version: "R7",
      hasCpe: false,
    });
  });
});

describe("applyChunk — linking to a device already in VIPER", () => {
  const linkOutcome: RowOutcome = {
    kind: "link",
    rowNumber: 2,
    assetId: "rad-us-001",
  };

  it("finds the device by id and maps it as csv:<its id>", async () => {
    const result = await applyChunk(chunkInput([stagedRow()], [linkOutcome]));

    const [, , engineInput] = engineCall();
    const written = await transformedItem();
    expect(engineInput.items[0].vendorId).toBe("csv:rad-us-001");
    expect(written.uniqueFieldConditions).toEqual([{ id: "rad-us-001" }]);
    expect(result).toEqual({ added: 0, linked: 1, failures: [] });
  });

  it("fills only the device's empty fields and keeps location parts another source wrote", async () => {
    await applyChunk(
      chunkInput([stagedRow({ facility: "North Campus" })], [linkOutcome]),
    );

    const written = await transformedItem();
    expect(written.updateData).toEqual({
      role: "Ultrasound",
      hostname: "us-bay-1",
      location: {
        facility: "Main Campus",
        street: "51 Valley Stream",
        building: "Imaging Department",
        room: "Ultrasound Bay 1",
      },
    });
    expect(written.updateData).not.toHaveProperty("ip");
    expect(written.updateData).not.toHaveProperty("serialNumber");
  });

  it("never re-groups the device", async () => {
    await applyChunk(chunkInput([stagedRow()], [linkOutcome]));

    const written = await transformedItem();
    expect(written.updateData).not.toHaveProperty("deviceGroupId");
    expect(resolveDeviceGroup).not.toHaveBeenCalled();
  });
});

describe("applyChunk — one engine call per row", () => {
  it("calls the engine once per row without recording a sync outcome", async () => {
    await applyChunk(
      chunkInput(
        [stagedRow({ rowNumber: 2 }), stagedRow({ rowNumber: 3 })],
        [
          { kind: "add", rowNumber: 2 },
          { kind: "link", rowNumber: 3, assetId: "rad-us-001" },
        ],
      ),
    );

    expect(processIntegrationSync).toHaveBeenCalledTimes(2);
    for (const [, config, engineInput] of vi.mocked(processIntegrationSync).mock
      .calls) {
      expect(config.shouldRecordSyncOutcome).toBe(false);
      expect(engineInput.items).toHaveLength(1);
    }
  });

  it("records a planned failure without touching the engine", async () => {
    const result = await applyChunk(
      chunkInput(
        [stagedRow({ rowNumber: 391, product: null })],
        [{ kind: "fail", rowNumber: 391, reason: "Model is missing" }],
      ),
    );

    expect(processIntegrationSync).not.toHaveBeenCalled();
    expect(result).toEqual({
      added: 0,
      linked: 0,
      failures: [{ rowNumber: 391, reason: "Model is missing" }],
    });
  });

  it("records the engine's reason when a row fails to write", async () => {
    vi.mocked(processIntegrationSync).mockResolvedValue({
      ...writtenOk,
      shouldRetry: true,
      message: "1 of 1 items failed: Internal Server Error",
    });

    const result = await applyChunk(
      chunkInput([stagedRow()], [{ kind: "add", rowNumber: 2 }]),
    );

    expect(result.failures).toEqual([
      { rowNumber: 2, reason: "Internal Server Error" },
    ]);
    expect(result.added).toBe(0);
  });

  it("records a thrown error as that row's reason and carries on", async () => {
    vi.mocked(processIntegrationSync)
      .mockRejectedValueOnce(new Error("Can't reach database server"))
      .mockResolvedValueOnce(writtenOk);

    const result = await applyChunk(
      chunkInput(
        [stagedRow({ rowNumber: 2 }), stagedRow({ rowNumber: 3 })],
        [
          { kind: "add", rowNumber: 2 },
          { kind: "add", rowNumber: 3 },
        ],
      ),
    );

    expect(result).toEqual({
      added: 1,
      linked: 0,
      failures: [{ rowNumber: 2, reason: "Can't reach database server" }],
    });
  });
});
