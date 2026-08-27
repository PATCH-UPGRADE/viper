// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  externalAssetMapping: { findFirst: vi.fn() },
  contract: { findUnique: vi.fn(), upsert: vi.fn() },
  managesRelationship: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ default: db }));
vi.mock("@/lib/router-utils", () => ({ resolveVendor: vi.fn() }));

import { resolveVendor } from "@/lib/router-utils";

import {
  buildResponsibilities,
  fleetContractDate,
  getContractTerms,
  listContracts,
  normalizeContractText,
  syncFleetContracts,
} from "../contracts";

// Real rows from the demo tenant, 2026-08-26.
const KIN_ROW = {
  contractId: "US_0035244333002160",
  contractName: "Sales Courtesy Contract  -  KIN.........",
  contractNumber: "0035244333002160",
  contractNumberConsolidated: "35244333002160",
  equipmentKey: "US_1064792319",
  contractStatusId: "1",
  contractGroup: "COURTESY",
  contractStatusDescription: null,
  contractTypeId: "6",
  contractTypeDescription: "COURTESY",
  expirationDate: "2027-03-31T00:00:00",
  startDate: "2026-04-01T00:00:00",
};

const KIN_TERMS = [
  { label: "COVERAGE CODE", value: ["MONDAY TO SUNDAY 24 HOURS"], groups: [] },
  { label: "MONDAY              START TIME", value: ["0"], groups: [] },
  { label: "Call Back Response", value: ["30 Minutes"], groups: [] },
  { label: "On site Response", value: ["4 HOURS - P1"], groups: [] },
  { label: "Performance Guarantee", value: ["95 %"], groups: [] },
  { label: "Labor", value: ["Covered PCP,Pref. OT/DT Rates"], groups: [] },
  { label: "Updates", value: ["UI and SI Both Included"], groups: [] },
  { label: "Emergency Repairs", value: ["Not Covered"], groups: [] },
  { label: "Service Provider", value: ["Siemens"], groups: [] },
];

const sessionReturning = (body: unknown, ok = true, status = 200) => ({
  request: async () =>
    ({ ok, status, json: async () => body }) as unknown as Response,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeContractText", () => {
  it("collapses padding and strips the trailing dots", () => {
    expect(
      normalizeContractText("Sales Courtesy Contract  -  KIN........."),
    ).toBe("Sales Courtesy Contract - KIN");
  });

  it("maps empty and null to null", () => {
    expect(normalizeContractText("   ")).toBeNull();
    expect(normalizeContractText(null)).toBeNull();
  });
});

describe("fleetContractDate", () => {
  it("treats Fleet's naive timestamps as UTC", () => {
    expect(fleetContractDate("2026-04-01T00:00:00")?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });

  it("maps null and unparseable values to null", () => {
    expect(fleetContractDate(null)).toBeNull();
    expect(fleetContractDate("0000-00-00")).toBeNull();
  });
});

describe("buildResponsibilities", () => {
  it("renders the guarantees and coverage flags from real terms", () => {
    expect(buildResponsibilities(KIN_ROW, KIN_TERMS)).toBe(
      "Serviced by Siemens Healthineers under Fleet contract 0035244333002160 (Sales Courtesy Contract - KIN). " +
        "Coverage: MONDAY TO SUNDAY 24 HOURS. " +
        "Call-back within 30 Minutes. " +
        "On-site response 4 HOURS - P1. " +
        "Uptime guarantee 95 %. " +
        "Covered: Labor, Updates. " +
        "Not covered: Emergency Repairs.",
    );
  });

  it("falls back to the header alone when the terms are empty", () => {
    expect(buildResponsibilities(KIN_ROW, [])).toBe(
      "Serviced by Siemens Healthineers under Fleet contract 0035244333002160 (Sales Courtesy Contract - KIN).",
    );
  });
});

describe("listContracts", () => {
  it("parses the list and strips unknown fields", async () => {
    const rows = await listContracts(sessionReturning([KIN_ROW]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contractNumber: "0035244333002160",
      equipmentKey: "US_1064792319",
      startDate: "2026-04-01T00:00:00",
    });
  });

  it("throws on a non-ok response", async () => {
    await expect(
      listContracts(sessionReturning([], false, 500)),
    ).rejects.toThrow("Fleet /contracts returned 500");
  });
});

describe("getContractTerms", () => {
  it("parses the term list", async () => {
    const terms = await getContractTerms(
      sessionReturning(KIN_TERMS),
      "0035244333002160",
      "US_1064792319",
    );
    expect(terms).toHaveLength(9);
    expect(terms[0]).toEqual({
      label: "COVERAGE CODE",
      value: ["MONDAY TO SUNDAY 24 HOURS"],
    });
  });
});

const bothEndpoints = {
  request: async (url: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => (url.includes("statusFilter") ? [KIN_ROW] : KIN_TERMS),
    }) as unknown as Response,
};

describe("syncFleetContracts", () => {
  beforeEach(() => {
    vi.mocked(resolveVendor).mockResolvedValue({ id: "vendor-1" } as Awaited<
      ReturnType<typeof resolveVendor>
    >);
    db.externalAssetMapping.findFirst.mockResolvedValue({ itemId: "asset-1" });
    db.contract.findUnique.mockResolvedValue(null);
    db.contract.upsert.mockResolvedValue({ id: "contract-1" });
    db.managesRelationship.create.mockResolvedValue({ id: "rel-1" });
    db.managesRelationship.findFirst.mockResolvedValue(null);
    db.managesRelationship.update.mockResolvedValue({ id: "rel-1" });
  });

  it("creates the relationship, upserts the contract, and connects the asset", async () => {
    const outcome = await syncFleetContracts(bothEndpoints, "int-1");

    expect(db.managesRelationship.create).toHaveBeenCalledWith({
      data: {
        responsibilities: expect.stringContaining("0035244333002160"),
        vendorId: "vendor-1",
        workOrderIntegrationId: "int-1",
      },
    });
    const upsert = db.contract.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ contractNumber: "0035244333002160" });
    expect(upsert.create).toMatchObject({
      contractNumber: "0035244333002160",
      vendorId: "vendor-1",
      title: "Sales Courtesy Contract - KIN",
      contractType: "COURTESY",
      managesRelationshipId: "rel-1",
    });
    expect(upsert.create.effectiveFrom?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(upsert.create.termsJson).toMatchObject({
      contract: { contractNumber: "0035244333002160" },
    });
    expect(db.managesRelationship.update).toHaveBeenCalledWith({
      where: { id: "rel-1" },
      data: {
        responsibilities: expect.stringContaining("Covered"),
        assets: { connect: { id: "asset-1" } },
      },
    });
    expect(outcome).toEqual({
      contractedAssetIds: new Set(["asset-1"]),
      errorMessage: null,
    });
  });

  it("skips a contract whose equipment was never synced", async () => {
    db.externalAssetMapping.findFirst.mockResolvedValue(null);

    const outcome = await syncFleetContracts(bothEndpoints, "int-1");

    expect(db.contract.upsert).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      contractedAssetIds: new Set(),
      errorMessage: null,
    });
  });

  it("reuses the relationship an existing contract already points at", async () => {
    db.contract.findUnique.mockResolvedValue({
      managesRelationshipId: "rel-9",
    });

    await syncFleetContracts(bothEndpoints, "int-1");

    expect(db.managesRelationship.create).not.toHaveBeenCalled();
    expect(db.contract.upsert.mock.calls[0][0].update).toMatchObject({
      managesRelationshipId: "rel-9",
    });
  });

  it("does not reconnect an already connected asset", async () => {
    db.managesRelationship.findFirst.mockResolvedValue({ id: "rel-1" });

    await syncFleetContracts(bothEndpoints, "int-1");

    expect(db.managesRelationship.update).toHaveBeenCalledWith({
      where: { id: "rel-1" },
      data: { responsibilities: expect.any(String) },
    });
  });

  it("reports a dead contracts endpoint instead of throwing", async () => {
    const outcome = await syncFleetContracts(
      sessionReturning([], false, 500),
      "int-1",
    );

    expect(outcome.contractedAssetIds).toEqual(new Set());
    expect(outcome.errorMessage).toBe("Fleet /contracts returned 500");
  });
});
