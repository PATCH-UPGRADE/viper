import { describe, expect, it } from "vitest";
import { PlatformEnum, ResourceType } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";
import {
  type ConfiguredRow,
  configuredRowsFor,
  filterConfiguredRows,
} from "./configured-rows";

const csvEntry = {
  platform: PlatformEnum.CSV_UPLOAD,
  displayName: "Spreadsheet Upload",
  categories: ["Hospital Inventory"],
  unscheduled: true,
} as CatalogEntry;

const item = (
  overrides: Partial<IntegrationListItem> & { startedAt?: Date | null },
): IntegrationListItem => {
  const { startedAt = new Date("2026-08-20T09:00:00Z"), ...rest } = overrides;
  return {
    id: "id",
    name: "name",
    platform: PlatformEnum.PARTNER,
    platformLabel: "Partner API",
    categories: ["Hospital Inventory"],
    resourceSyncs: [{ resource: ResourceType.Asset, lastAttemptAt: startedAt }],
    ...rest,
  } as IntegrationListItem;
};

const cisa = item({
  id: "cisa",
  name: "CISA",
  platform: PlatformEnum.CSAF,
  platformLabel: "CSAF Advisories",
  categories: ["Notifications"],
});
const blueflow = item({ id: "blueflow", name: "Blueflow" });
const uploadA = item({
  id: "a",
  name: "east-wing.csv",
  platform: PlatformEnum.CSV_UPLOAD,
  startedAt: new Date("2026-08-19T00:00:00Z"),
});
const uploadB = item({
  id: "b",
  name: "west-wing.csv",
  platform: PlatformEnum.CSV_UPLOAD,
  startedAt: new Date("2026-08-20T00:00:00Z"),
});
const neverStarted = item({
  id: "c",
  name: "draft.csv",
  platform: PlatformEnum.CSV_UPLOAD,
  startedAt: null,
});

const rows = configuredRowsFor(
  [cisa, uploadA, blueflow, uploadB, neverStarted],
  [csvEntry],
);

const names = (filtered: ConfiguredRow[]) =>
  filtered.map((row) =>
    row.kind === "uploads"
      ? `${row.catalogEntry.displayName}: ${row.uploads.map((u) => u.name).join(", ")}`
      : row.integration.name,
  );

describe("configuredRowsFor", () => {
  it("groups a platform's started uploads into one row, newest first", () => {
    expect(names(rows)).toEqual([
      "CISA",
      "Spreadsheet Upload: west-wing.csv, east-wing.csv",
      "Blueflow",
    ]);
  });
});

describe("filterConfiguredRows", () => {
  it("keeps only rows in the chosen category", () => {
    expect(
      names(
        filterConfiguredRows(rows, { category: "Notifications", query: "" }),
      ),
    ).toEqual(["CISA"]);
  });

  it("searches names and platform labels, ignoring case", () => {
    expect(
      names(filterConfiguredRows(rows, { category: "all", query: "csaf" })),
    ).toEqual(["CISA"]);
  });

  it("searches a scheduled integration's stream names", () => {
    expect(
      names(filterConfiguredRows(rows, { category: "all", query: "Assets" })),
    ).toEqual(["CISA", "Blueflow"]);
  });

  it("keeps only the uploads a search matches", () => {
    expect(
      names(filterConfiguredRows(rows, { category: "all", query: "west" })),
    ).toEqual(["Spreadsheet Upload: west-wing.csv"]);
  });

  it("keeps every upload when the search matches the platform", () => {
    expect(
      names(
        filterConfiguredRows(rows, {
          category: "all",
          query: "spreadsheet up",
        }),
      ),
    ).toEqual(["Spreadsheet Upload: west-wing.csv, east-wing.csv"]);
  });
});
