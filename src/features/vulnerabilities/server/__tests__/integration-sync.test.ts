// @vitest-environment node
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mapping: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
  },
  createVulnerabilityRecord: vi.fn(async () => ({
    record: { id: "rec-new" },
  })),
  updateVulnerabilityRecord: vi.fn(async () => ({})),
  deleteVulnerabilityRecord: vi.fn(async () => ({})),
  recordDataFromInput: vi.fn(async (_input: unknown, options: unknown) => ({
    data: true,
    options,
  })),
  recordPatchFromInput: vi.fn(async () => ({ patch: true })),
  upsertResourceSync: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: { externalVulnerabilityRecordMapping: mocks.mapping },
}));
vi.mock("../records", () => ({
  createVulnerabilityRecord: mocks.createVulnerabilityRecord,
  updateVulnerabilityRecord: mocks.updateVulnerabilityRecord,
  deleteVulnerabilityRecord: mocks.deleteVulnerabilityRecord,
}));
vi.mock("../record-input", () => ({
  recordDataFromInput: mocks.recordDataFromInput,
  recordPatchFromInput: mocks.recordPatchFromInput,
}));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  upsertResourceSync: mocks.upsertResourceSync,
  handlePrismaError: () => "Internal Server Error",
}));

import { processVulnerabilityIntegrationSync } from "../integration-sync";

const item = (externalId: string) => ({
  externalId,
  upstreamApi: `https://partner.example.com/vulns/${externalId}`,
  identifiers: ["CVE-2024-1234"],
  devices: [{ manufacturer: "Baxter", product: "Sigma Spectrum" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mapping.findUnique.mockResolvedValue(null);
});

describe("processVulnerabilityIntegrationSync", () => {
  it("creates an unowned record and maps it for a new item", async () => {
    const response = await processVulnerabilityIntegrationSync(
      { items: [item("v-1")] },
      "shadow-1",
      "int-1",
    );

    expect(mocks.recordDataFromInput).toHaveBeenCalledWith(
      {
        identifiers: ["CVE-2024-1234"],
        devices: [{ manufacturer: "Baxter", product: "Sigma Spectrum" }],
      },
      { source: undefined, userId: null },
    );
    expect(mocks.createVulnerabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({ data: true }),
      { actingUserId: "shadow-1" },
    );
    expect(mocks.mapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "rec-new",
        integrationId: "int-1",
        externalId: "v-1",
        upstreamApi: "https://partner.example.com/vulns/v-1",
        webUrl: null,
      }),
    });
    expect(response).toMatchObject({
      message: "success",
      createdItemsCount: 1,
      updatedItemsCount: 0,
      shouldRetry: false,
    });
  });

  it("updates the mapped record for an item it has seen", async () => {
    mocks.mapping.findUnique.mockResolvedValue({
      id: "map-1",
      itemId: "rec-1",
    });

    const response = await processVulnerabilityIntegrationSync(
      { items: [item("v-1")] },
      "shadow-1",
      "int-1",
    );

    expect(mocks.updateVulnerabilityRecord).toHaveBeenCalledWith("rec-1", {
      patch: true,
    });
    expect(mocks.createVulnerabilityRecord).not.toHaveBeenCalled();
    expect(mocks.mapping.update).toHaveBeenCalledWith({
      where: { id: "map-1" },
      data: expect.objectContaining({
        upstreamApi: "https://partner.example.com/vulns/v-1",
      }),
    });
    expect(response).toMatchObject({
      createdItemsCount: 0,
      updatedItemsCount: 1,
    });
  });

  it("passes a fixed source through to every record", async () => {
    await processVulnerabilityIntegrationSync(
      { items: [item("v-1")] },
      "shadow-1",
      "int-1",
      { source: "AI" },
    );

    expect(mocks.recordDataFromInput).toHaveBeenCalledWith(expect.anything(), {
      source: "AI",
      userId: null,
    });
  });

  it("deletes the new record when a concurrent sync mapped the item first", async () => {
    mocks.mapping.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );

    const response = await processVulnerabilityIntegrationSync(
      { items: [item("v-1")] },
      "shadow-1",
      "int-1",
    );

    expect(mocks.deleteVulnerabilityRecord).toHaveBeenCalledWith("rec-new");
    expect(response).toMatchObject({ createdItemsCount: 0, shouldRetry: true });
  });

  it("keeps going after a failed item, and reports it", async () => {
    mocks.createVulnerabilityRecord.mockRejectedValueOnce(
      new TRPCError({ code: "CONFLICT", message: "Identifiers clash" }),
    );

    const response = await processVulnerabilityIntegrationSync(
      { items: [item("v-1"), item("v-2")] },
      "shadow-1",
      "int-1",
    );

    expect(response).toMatchObject({
      createdItemsCount: 1,
      shouldRetry: true,
      message: "1 of 2 items failed: Identifiers clash",
    });
    expect(mocks.upsertResourceSync).toHaveBeenCalledWith(
      "int-1",
      "Vulnerability",
      response,
      expect.any(Date),
    );
  });

  it("leaves the sync outcome to the caller when asked", async () => {
    await processVulnerabilityIntegrationSync(
      { items: [item("v-1")] },
      "shadow-1",
      "int-1",
      { shouldRecordSyncOutcome: false },
    );

    expect(mocks.upsertResourceSync).not.toHaveBeenCalled();
  });
});
