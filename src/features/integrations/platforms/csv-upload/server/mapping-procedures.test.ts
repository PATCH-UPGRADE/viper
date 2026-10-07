// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

const agents = vi.hoisted(() => ({
  suggestColumnMapping: vi.fn(),
  suggestStatusValues: vi.fn(),
  suggestNameMatches: vi.fn(),
}));
const names = vi.hoisted(() => ({
  findExistingManufacturers: vi.fn(),
  findExistingProducts: vi.fn(),
  listManufacturerCandidates: vi.fn(),
  listProductCandidates: vi.fn(),
  searchNames: vi.fn(),
}));

vi.mock("../agent/map-columns", () => ({
  suggestColumnMapping: agents.suggestColumnMapping,
}));
vi.mock("../agent/map-values", () => ({
  suggestStatusValues: agents.suggestStatusValues,
}));
vi.mock("../agent/match-names", () => ({
  suggestNameMatches: agents.suggestNameMatches,
}));
vi.mock("../import/names", () => names);

import { createCallerFactory } from "@/trpc/init";
import { csvImportRouter } from "./routers";

const caller = createCallerFactory(csvImportRouter)({
  req: undefined,
  auth: { user: { id: "user-test" } },
});

const GE = { id: "mfr_ge", displayName: "GE HealthCare" };
const SIEMENS = { id: "mfr_siemens", displayName: "Siemens Healthineers" };
const BD = { id: "mfr_bd", displayName: "BD" };

beforeEach(() => {
  vi.clearAllMocks();
  names.findExistingManufacturers.mockResolvedValue(new Map());
  names.findExistingProducts.mockResolvedValue(new Map());
  names.listManufacturerCandidates.mockResolvedValue([]);
  names.listProductCandidates.mockResolvedValue([]);
  agents.suggestNameMatches.mockResolvedValue(new Map());
});

describe("csvImport.suggestMapping", () => {
  const input = {
    headers: ["Mfr", "Model", "In Service"],
    sampleRows: [{ Mfr: "BD", Model: "Alaris 8015", "In Service": "Y" }],
    distinctValues: { "In Service": ["Y", "N"] },
  };

  it("maps the columns, then the values of the status column", async () => {
    const fields = {
      manufacturer: { header: "Mfr", confidence: "Matched" },
      product: { header: "Model", confidence: "Matched" },
      status: { header: "In Service", confidence: "NeedsReview" },
    };
    const statusValues = [
      { value: "Y", status: "Active", confidence: "Matched" },
      { value: "N", status: null, confidence: "NeedsReview" },
    ];
    agents.suggestColumnMapping.mockResolvedValue(fields);
    agents.suggestStatusValues.mockResolvedValue(statusValues);

    await expect(caller.suggestMapping(input)).resolves.toEqual({
      fields,
      statusValues,
    });
    expect(agents.suggestColumnMapping).toHaveBeenCalledWith(
      input.headers,
      input.sampleRows,
    );
    expect(agents.suggestStatusValues).toHaveBeenCalledWith("In Service", [
      "Y",
      "N",
    ]);
  });

  it("does not ask about status values when no column holds status", async () => {
    agents.suggestColumnMapping.mockResolvedValue({
      manufacturer: { header: "Mfr", confidence: "Matched" },
    });

    const result = await caller.suggestMapping(input);

    expect(result.statusValues).toEqual([]);
    expect(agents.suggestStatusValues).not.toHaveBeenCalled();
  });
});

describe("csvImport.matchNames", () => {
  it("matches exact names itself and asks the agent only about the rest", async () => {
    names.findExistingManufacturers.mockResolvedValue(
      new Map([["ge healthcare", { ref: GE, matchedByAlias: true }]]),
    );
    const candidates = [
      { id: "mfr_siemens", displayName: "Siemens Healthineers", aliases: [] },
    ];
    names.listManufacturerCandidates.mockResolvedValue(candidates);
    agents.suggestNameMatches.mockResolvedValueOnce(
      new Map([
        [
          "Siemens",
          {
            id: "mfr_siemens",
            confidence: "NeedsReview",
            reason: "Siemens Healthineers is the medical arm of Siemens.",
          },
        ],
      ]),
    );

    const result = await caller.matchNames({
      manufacturers: ["GE Healthcare", "Siemens", "Acme Biomedical"],
      products: [],
    });

    expect(agents.suggestNameMatches).toHaveBeenCalledWith({
      kind: "manufacturer",
      names: ["Siemens", "Acme Biomedical"],
      candidates,
    });
    expect(result.manufacturers).toEqual([
      {
        name: "GE Healthcare",
        status: "exact",
        match: GE,
        confidence: null,
        matchedByAlias: true,
      },
      {
        name: "Siemens",
        status: "suggested",
        match: SIEMENS,
        confidence: "NeedsReview",
        matchedByAlias: false,
      },
      {
        name: "Acme Biomedical",
        status: "new",
        match: null,
        confidence: null,
        matchedByAlias: false,
      },
    ]);
  });

  it("does not load candidates when every manufacturer matched exactly", async () => {
    names.findExistingManufacturers.mockResolvedValue(
      new Map([["bd", { ref: BD, matchedByAlias: false }]]),
    );

    await caller.matchNames({ manufacturers: ["BD"], products: [] });

    expect(names.listManufacturerCandidates).not.toHaveBeenCalled();
  });

  it("suggests a product only from the products of the manufacturer it matched", async () => {
    names.findExistingManufacturers.mockResolvedValue(
      new Map([["bd", { ref: BD, matchedByAlias: false }]]),
    );
    names.findExistingProducts.mockResolvedValue(
      new Map([
        [
          "alaris 8015",
          {
            ref: { id: "prod_alaris", displayName: "Alaris 8015" },
            matchedByAlias: false,
          },
        ],
      ]),
    );
    const bdPump = {
      id: "prod_pcu",
      displayName: "Alaris PC Unit 8015",
      aliases: [],
      manufacturerIds: ["mfr_bd"],
    };
    const otherMakersPump = {
      id: "prod_other",
      displayName: "Other Pump",
      aliases: [],
      manufacturerIds: ["mfr_other"],
    };
    names.listProductCandidates.mockResolvedValue([bdPump, otherMakersPump]);
    agents.suggestNameMatches.mockImplementation(async ({ kind }) =>
      kind === "product"
        ? new Map([
            [
              "Alaris PCU",
              { id: "prod_pcu", confidence: "Matched", reason: "Same unit." },
            ],
          ])
        : new Map(),
    );

    const result = await caller.matchNames({
      manufacturers: ["BD", "Acme Biomedical"],
      products: [
        { manufacturer: "BD", product: "Alaris 8015" },
        { manufacturer: "BD", product: "Alaris PCU" },
        { manufacturer: "Acme Biomedical", product: "Acme Pump 1" },
      ],
    });

    expect(names.listProductCandidates).toHaveBeenCalledWith(["mfr_bd"]);
    expect(agents.suggestNameMatches).toHaveBeenCalledWith({
      kind: "product",
      names: ["Alaris PCU"],
      candidates: [bdPump],
    });
    expect(result.products).toEqual([
      {
        name: "Alaris 8015",
        manufacturer: "BD",
        status: "exact",
        match: { id: "prod_alaris", displayName: "Alaris 8015" },
        confidence: null,
        matchedByAlias: false,
      },
      {
        name: "Alaris PCU",
        manufacturer: "BD",
        status: "suggested",
        match: { id: "prod_pcu", displayName: "Alaris PC Unit 8015" },
        confidence: "Matched",
        matchedByAlias: false,
      },
      {
        name: "Acme Pump 1",
        manufacturer: "Acme Biomedical",
        status: "new",
        match: null,
        confidence: null,
        matchedByAlias: false,
      },
    ]);
  });
});
