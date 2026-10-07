import { describe, expect, it } from "vitest";
import type { MatchNamesOutput, NameDecisions } from "../../contract";
import {
  countNames,
  exactMatchDecisions,
  finalNameDecisions,
  matchNamesInputFor,
  nameReviewFor,
  openNameQuestions,
  summarizeNameDecisions,
} from "../names";

const MATCHES: MatchNamesOutput = {
  manufacturers: [
    {
      name: "Philips",
      status: "exact",
      match: { id: "mf-philips", displayName: "Philips" },
      confidence: null,
      matchedByAlias: true,
    },
    {
      name: "GE Healthcare",
      status: "suggested",
      match: { id: "mf-ge", displayName: "GE HealthCare" },
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
  ],
  products: [
    {
      manufacturer: "Philips",
      name: "IntelliVue MX450",
      status: "exact",
      match: { id: "pr-mx450", displayName: "IntelliVue MX450" },
      confidence: null,
      matchedByAlias: false,
    },
    {
      manufacturer: "GE Healthcare",
      name: "LOGIQ e",
      status: "suggested",
      match: { id: "pr-logiq", displayName: "LOGIQ e R7" },
      confidence: "NeedsReview",
      matchedByAlias: false,
    },
    {
      manufacturer: "Acme Biomedical",
      name: "ThermaFlo 200",
      status: "new",
      match: null,
      confidence: null,
      matchedByAlias: false,
    },
  ],
};

describe("matchNamesInputFor and countNames", () => {
  const rows = [
    { manufacturer: "BD", product: "Alaris 8015" },
    { manufacturer: "bd", product: "alaris 8015" },
    { manufacturer: "BD", product: null },
    { manufacturer: null, product: "Orphan" },
  ];

  it("sends each name once, in its first spelling", () => {
    expect(matchNamesInputFor(rows)).toEqual({
      manufacturers: ["BD"],
      products: [{ manufacturer: "BD", product: "Alaris 8015" }],
    });
  });

  it("counts devices per name regardless of case", () => {
    const counts = countNames(rows);
    expect(counts.manufacturers.get("bd")).toBe(3);
    expect(counts.products.get("bd::alaris 8015")).toBe(2);
  });
});

describe("name review", () => {
  it("answers exact matches up front", () => {
    expect(exactMatchDecisions(MATCHES)).toEqual({
      manufacturers: { philips: { kind: "existing", id: "mf-philips" } },
      products: {
        "philips::intellivue mx450": { kind: "existing", id: "pr-mx450" },
      },
    });
  });

  it("treats a product under a new manufacturer as new and never asks about it", () => {
    const decisions = exactMatchDecisions(MATCHES);
    const review = nameReviewFor(MATCHES, decisions);
    expect(review.newProducts).toEqual([
      { product: MATCHES.products[2], isNewWithItsManufacturer: true },
    ]);
    expect(openNameQuestions(review, decisions)).toBe(3);
  });

  it("asks about a new manufacturer's product once the manufacturer is picked as existing", () => {
    const decisions: NameDecisions = {
      ...exactMatchDecisions(MATCHES),
      manufacturers: {
        ...exactMatchDecisions(MATCHES).manufacturers,
        "acme biomedical": { kind: "existing", id: "mf-acme" },
      },
    };
    const review = nameReviewFor(MATCHES, decisions);
    expect(review.newProducts[0].isNewWithItsManufacturer).toBe(false);
    expect(openNameQuestions(review, decisions)).toBe(3);
  });

  it("moves a suggested product to new when its manufacturer is added as new", () => {
    const decisions: NameDecisions = {
      manufacturers: { "ge healthcare": { kind: "new" } },
      products: {},
    };
    const review = nameReviewFor(MATCHES, decisions);
    expect(review.suggestedProducts).toEqual([]);
    expect(review.newProducts.map(({ product }) => product.name)).toContain(
      "LOGIQ e",
    );
  });

  it("lists the names that matched exactly or through a saved spelling", () => {
    const review = nameReviewFor(MATCHES, exactMatchDecisions(MATCHES));
    expect(review.matchedManufacturers).toHaveLength(1);
    expect(review.matchedProducts).toHaveLength(1);
  });
});

describe("final decisions and their summary", () => {
  const answered: NameDecisions = {
    manufacturers: {
      philips: { kind: "existing", id: "mf-philips" },
      "ge healthcare": { kind: "existing", id: "mf-ge" },
      "acme biomedical": { kind: "new" },
    },
    products: {
      "philips::intellivue mx450": { kind: "existing", id: "pr-mx450" },
      "ge healthcare::logiq e": { kind: "new" },
    },
  };

  it("fills in the product under a new manufacturer as new", () => {
    expect(finalNameDecisions(MATCHES, answered).products).toEqual({
      "philips::intellivue mx450": { kind: "existing", id: "pr-mx450" },
      "ge healthcare::logiq e": { kind: "new" },
      "acme biomedical::thermaflo 200": { kind: "new" },
    });
  });

  it("drops answers for names that are no longer in the file", () => {
    const withStaleAnswer: NameDecisions = {
      ...answered,
      manufacturers: {
        ...answered.manufacturers,
        "removed vendor": { kind: "new" },
      },
    };
    expect(
      finalNameDecisions(MATCHES, withStaleAnswer).manufacturers,
    ).not.toHaveProperty("removed vendor");
  });

  it("lists new names and the spellings that will be saved", () => {
    const decisions = finalNameDecisions(MATCHES, answered);
    expect(summarizeNameDecisions(MATCHES, decisions)).toEqual({
      newManufacturers: ["Acme Biomedical"],
      newProducts: ["LOGIQ e", "ThermaFlo 200"],
      savedSpellings: ["GE Healthcare"],
    });
  });
});
