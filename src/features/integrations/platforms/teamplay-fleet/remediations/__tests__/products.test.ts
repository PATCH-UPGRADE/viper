import { describe, expect, it } from "vitest";
import { parseProductsAffected, versionRangeOf } from "../products";

describe("parseProductsAffected", () => {
  it("reads one product, its line and its fix", () => {
    expect(
      parseProductsAffected(
        "syngo.plaza VB30E\nAll versions < VB30E_HF07\naffected by CVE-2024-52334",
      ),
    ).toEqual([
      {
        product: "syngo.plaza",
        versionLine: "VB30E",
        fixedVersion: "VB30E_HF07",
      },
    ]);
  });

  it("reads several products in one advisory", () => {
    expect(
      parseProductsAffected(
        "syngo.plaza VB30E\nAll versions < VB30E_HF07\nsyngo Carbon VA20\nAll versions < VA20_HF03",
      ),
    ).toEqual([
      {
        product: "syngo.plaza",
        versionLine: "VB30E",
        fixedVersion: "VB30E_HF07",
      },
      {
        product: "syngo Carbon",
        versionLine: "VA20",
        fixedVersion: "VA20_HF03",
      },
    ]);
  });

  it("keeps a product with no stated fix", () => {
    expect(parseProductsAffected("syngo.via\nAll versions")).toEqual([
      { product: "syngo.via", versionLine: null, fixedVersion: null },
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(parseProductsAffected(null)).toEqual([]);
  });
});

describe("versionRangeOf", () => {
  it("is every version below the fix", () => {
    expect(
      versionRangeOf({
        product: "p",
        versionLine: null,
        fixedVersion: "VB30E_HF07",
      }),
    ).toBe("vers:generic/<VB30E_HF07");
  });

  it("is none when no fix is stated", () => {
    expect(
      versionRangeOf({
        product: "p",
        versionLine: null,
        fixedVersion: null,
      }),
    ).toBeNull();
  });
});
