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

import {
  buildResponsibilities,
  fleetContractDate,
  getContractTerms,
  listContracts,
  normalizeContractText,
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
