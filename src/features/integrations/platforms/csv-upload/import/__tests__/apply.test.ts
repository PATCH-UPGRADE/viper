// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: vi.fn(),
}));
vi.mock("@/lib/router-utils", () => ({ resolveDevice: vi.fn() }));
vi.mock("@/features/device-types/server/apply-device-type", () => ({}));
vi.mock("@/features/device-types/server/resolve-device-type", () => ({}));
vi.mock("../match-rows", () => ({}));

import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { resolveDevice } from "@/lib/router-utils";
import { addedAssetIdFor, type StagedRow } from "../../contract";
import { type ApplyChunkInput, applyChunk } from "../apply";
import type { ContextAsset } from "../match-rows";

const device = {
  manufacturerId: "m-1",
  productId: "p-1",
  versionId: null,
  versionStatus: "UNKNOWN" as const,
};

const row: StagedRow = {
  rowNumber: 1,
  manufacturer: "Acme",
  product: "X1",
  version: null,
  deviceType: null,
  serialNumber: "S1",
  macAddress: null,
  hostname: "row-host",
  ip: "10.0.0.1",
  networkSegment: "VLAN-1",
  status: "Active",
  facility: null,
  building: "Row building",
  floor: "2",
  room: null,
  raw: [],
};

const matched: ContextAsset = {
  id: "asset-1",
  productId: "p-9",
  label: "Asset",
  platforms: [],
  serialNumber: "S1",
  macAddress: null,
  hostname: null,
  ip: "10.0.0.9",
  networkSegment: "VLAN-9",
  status: null,
  location: { building: "Stored building" },
};

const observedAt = new Date("2026-11-01T00:00:00Z");

const input: ApplyChunkInput = {
  importId: "import",
  integrationId: "int-1",
  userId: "uploader",
  observedAt,
  rows: [row, { ...row, rowNumber: 2 }],
  outcomes: [
    { rowNumber: 1, kind: "add" },
    { rowNumber: 2, kind: "link", assetId: "asset-1" },
  ],
  context: { assets: new Map([["asset-1", matched]]) },
  canonicalNames: { manufacturers: new Map(), products: new Map() },
};

/** The writes of the two rows, and the runs they belong to. */
async function apply() {
  await applyChunk(input);
  const calls = vi.mocked(processIntegrationSync).mock.calls;
  const [add, link] = await Promise.all(
    calls.map(([config, { items }]) =>
      config.transformInputItem(items[0], "uploader"),
    ),
  );
  return { add, link, runs: calls.map(([, , run]) => run) };
}

beforeEach(() => {
  vi.mocked(processIntegrationSync).mockReset().mockResolvedValue({
    message: "success",
    createdItemsCount: 1,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: observedAt.toISOString(),
  });
  vi.mocked(resolveDevice).mockResolvedValue(device);
});

describe("applyChunk", () => {
  it("gives each row the time of the import, with the uploader as the actor, under one name", async () => {
    const { runs } = await apply();
    const run = {
      userId: "uploader",
      integrationId: "int-1",
      observedAt,
      actorUserId: "uploader",
      integrationName: "Spreadsheet Upload",
    };
    expect(runs).toEqual([run, run]);
  });

  it("creates an added device from the whole row, and a retry applies nothing", async () => {
    const { add } = await apply();
    const tracked = {
      serialNumber: "S1",
      hostname: "row-host",
      ip: "10.0.0.1",
      location: { building: "Row building", floor: "2" },
      ...device,
    };
    expect(add).toMatchObject({
      create: {
        fields: { ...tracked, networkSegment: "VLAN-1", status: "Active" },
        only: { id: addedAssetIdFor("import", 1) },
      },
      update: { fields: tracked, apply: [] },
    });
  });

  it("records the whole row of a matched device, and applies what it is missing", async () => {
    const { link } = await apply();
    expect(link).toMatchObject({
      create: null,
      update: {
        fields: {
          serialNumber: "S1",
          hostname: "row-host",
          ip: "10.0.0.1",
          location: { building: "Row building", floor: "2" },
          ...device,
          status: "Active",
        },
        apply: ["hostname", "location"],
        applyAs: { location: { building: "Stored building", floor: "2" } },
      },
    });
    expect(link).not.toHaveProperty("update.fields.networkSegment");
  });
});
