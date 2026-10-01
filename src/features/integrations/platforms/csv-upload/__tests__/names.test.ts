// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  manufacturer: { findMany: vi.fn(), findFirst: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

import {
  findExistingManufacturers,
  findExistingProducts,
  listManufacturerCandidates,
  listProductCandidates,
  nameBelongsToAnother,
  searchNames,
} from "../import/names";

const GE = {
  id: "mfr_ge",
  canonicalName: "ge healthcare",
  canonicalDisplayName: "GE HealthCare",
  nameMappings: ["ge medical systems"],
};
const LOGIQ = {
  id: "prod_logiq",
  canonicalName: "logiq e",
  canonicalDisplayName: "LOGIQ e",
  nameMappings: [],
};

beforeEach(() => vi.clearAllMocks());

describe("findExistingManufacturers", () => {
  it("finds every name by canonical name or alias in one query", async () => {
    db.manufacturer.findMany.mockResolvedValue([GE]);

    const found = await findExistingManufacturers([
      "GE Healthcare",
      " GE Medical Systems ",
      "Acme Biomedical",
    ]);

    expect(db.manufacturer.findMany).toHaveBeenCalledOnce();
    expect(db.manufacturer.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        {
          canonicalName: {
            in: ["ge healthcare", "ge medical systems", "acme biomedical"],
          },
        },
        {
          nameMappings: {
            hasSome: ["ge healthcare", "ge medical systems", "acme biomedical"],
          },
        },
      ],
    });
    expect(found.get("ge healthcare")).toEqual({
      ref: { id: "mfr_ge", displayName: "GE HealthCare" },
      matchedByAlias: false,
    });
    expect(found.get("ge medical systems")).toEqual({
      ref: { id: "mfr_ge", displayName: "GE HealthCare" },
      matchedByAlias: true,
    });
    expect(found.has("acme biomedical")).toBe(false);
  });

  it("skips the query when there is nothing to look up", async () => {
    expect((await findExistingManufacturers(["  "])).size).toBe(0);
    expect(db.manufacturer.findMany).not.toHaveBeenCalled();
  });
});

describe("findExistingProducts", () => {
  it("finds a product by its canonical name", async () => {
    db.product.findMany.mockResolvedValue([LOGIQ]);

    const found = await findExistingProducts(["LOGIQ e"]);

    expect(found.get("logiq e")).toEqual({
      ref: { id: "prod_logiq", displayName: "LOGIQ e" },
      matchedByAlias: false,
    });
  });
});

describe("listManufacturerCandidates", () => {
  it("offers at most 1000 manufacturers with their aliases", async () => {
    db.manufacturer.findMany.mockResolvedValue([GE]);

    await expect(listManufacturerCandidates()).resolves.toEqual([
      {
        id: "mfr_ge",
        displayName: "GE HealthCare",
        aliases: ["ge medical systems"],
      },
    ]);
    expect(db.manufacturer.findMany.mock.calls[0][0].take).toBe(1000);
  });
});

describe("listProductCandidates", () => {
  it("offers only products that already have a device group under those manufacturers", async () => {
    db.product.findMany.mockResolvedValue([
      {
        ...LOGIQ,
        deviceGroups: [
          { manufacturerId: "mfr_ge" },
          { manufacturerId: "mfr_ge" },
        ],
      },
    ]);

    const candidates = await listProductCandidates(["mfr_ge"]);

    expect(db.product.findMany.mock.calls[0][0].where).toEqual({
      deviceGroups: { some: { manufacturerId: { in: ["mfr_ge"] } } },
    });
    expect(candidates).toEqual([
      {
        id: "prod_logiq",
        displayName: "LOGIQ e",
        aliases: [],
        manufacturerIds: ["mfr_ge"],
      },
    ]);
  });

  it("skips the query when no manufacturer is known", async () => {
    await expect(listProductCandidates([])).resolves.toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});

describe("searchNames", () => {
  it("searches manufacturers by either name or an exact alias, 20 at most", async () => {
    db.manufacturer.findMany.mockResolvedValue([GE]);

    await expect(searchNames("manufacturer", "GE")).resolves.toEqual([
      { id: "mfr_ge", displayName: "GE HealthCare" },
    ]);
    const query = db.manufacturer.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      OR: [
        { canonicalName: { contains: "GE", mode: "insensitive" } },
        { canonicalDisplayName: { contains: "GE", mode: "insensitive" } },
        { nameMappings: { has: "ge" } },
      ],
    });
    expect(query.take).toBe(20);
  });

  it("searches only one manufacturer's products when given one", async () => {
    db.product.findMany.mockResolvedValue([LOGIQ]);

    await searchNames("product", "logiq", "mfr_ge");

    expect(db.product.findMany.mock.calls[0][0].where).toMatchObject({
      deviceGroups: { some: { manufacturerId: "mfr_ge" } },
    });
  });
});

describe("nameBelongsToAnother", () => {
  it("says yes when the spelling is another manufacturer's name or alias", async () => {
    db.manufacturer.findFirst.mockResolvedValue({ id: "mfr_other" });

    await expect(
      nameBelongsToAnother("manufacturer", "GE Healthcare", "mfr_ge"),
    ).resolves.toBe(true);
    expect(db.manufacturer.findFirst.mock.calls[0][0].where).toEqual({
      id: { not: "mfr_ge" },
      OR: [
        { canonicalName: "ge healthcare" },
        { nameMappings: { has: "ge healthcare" } },
      ],
    });
  });

  it("checks products against products", async () => {
    db.product.findFirst.mockResolvedValue(null);

    await expect(
      nameBelongsToAnother("product", "Logiq E", "prod_logiq"),
    ).resolves.toBe(false);
    expect(db.manufacturer.findFirst).not.toHaveBeenCalled();
  });
});
