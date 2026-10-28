import { describe, expect, it } from "vitest";
import { formatReleaseDate, manufacturerLink } from "../release";

describe("manufacturerLink", () => {
  it("uses the first mapping with a page", () => {
    expect(
      manufacturerLink([
        {
          webUrl: null,
          integration: { name: "MedISAO" },
        },
        {
          webUrl: "http://fleet.test/a/25",
          integration: { name: "teamplay Fleet" },
        },
      ]),
    ).toEqual({ href: "http://fleet.test/a/25", label: "teamplay Fleet" });
  });

  it("is null when no mapping has a page", () => {
    expect(
      manufacturerLink([{ webUrl: null, integration: { name: "MedISAO" } }]),
    ).toBeNull();
    expect(manufacturerLink([])).toBeNull();
  });
});

describe("formatReleaseDate", () => {
  it("reads midnight UTC as that day, in any time zone", () => {
    expect(formatReleaseDate(new Date("2026-02-10T00:00:00.000Z"))).toBe(
      "Feb 10, 2026",
    );
  });
});
