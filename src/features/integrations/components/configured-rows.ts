import type { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type { Category, IntegrationListItem } from "../types";
import { streamName } from "./connector-status";

export interface PlatformUploads {
  catalogEntry: CatalogEntry;
  /** Newest first. */
  uploads: IntegrationListItem[];
}

/**
 * One row of the configured-integrations table. A scheduled integration is its own row; an
 * unscheduled platform (CSV Upload) gets one row for all of its uploads.
 */
export type ConfiguredRow =
  | {
      kind: "integration";
      integration: IntegrationListItem;
      catalogEntry?: CatalogEntry;
    }
  | ({ kind: "uploads" } & PlatformUploads);

const startedAtOf = (upload: IntegrationListItem): Date | null =>
  upload.resourceSyncs[0]?.lastAttemptAt ?? null;

const newestFirst = (uploads: IntegrationListItem[]): IntegrationListItem[] =>
  [...uploads].sort((first, second) => {
    const firstStartedAt = startedAtOf(first)?.getTime() ?? 0;
    const secondStartedAt = startedAtOf(second)?.getTime() ?? 0;
    return secondStartedAt - firstStartedAt;
  });

export const configuredRowsFor = (
  integrations: IntegrationListItem[],
  catalog: CatalogEntry[],
): ConfiguredRow[] => {
  const entryByPlatform = new Map(
    catalog.map((entry) => [entry.platform, entry]),
  );
  const uploadsByPlatform = new Map<PlatformEnum, IntegrationListItem[]>();
  const rows: ConfiguredRow[] = [];

  for (const integration of integrations) {
    const catalogEntry = entryByPlatform.get(integration.platform);
    if (!catalogEntry?.unscheduled) {
      rows.push({ kind: "integration", integration, catalogEntry });
      continue;
    }
    // An upload that never started has nothing to show yet.
    if (startedAtOf(integration) === null) continue;

    const uploadsSoFar = uploadsByPlatform.get(integration.platform);
    if (uploadsSoFar) {
      uploadsSoFar.push(integration);
      continue;
    }
    const uploads = [integration];
    uploadsByPlatform.set(integration.platform, uploads);
    rows.push({ kind: "uploads", catalogEntry, uploads });
  }

  return rows.map((row) =>
    row.kind === "uploads"
      ? { ...row, uploads: newestFirst(row.uploads) }
      : row,
  );
};

export const categoriesOf = (row: ConfiguredRow): Category[] =>
  row.kind === "uploads"
    ? row.catalogEntry.categories
    : row.integration.categories;

/** The "All" chip, or one category. */
export type CategoryFilter = Category | "all";

export interface ConnectorFilter {
  category: CategoryFilter;
  /** Matched case-insensitively against names (and descriptions, where a card has one). */
  query: string;
}

export const inCategory = (categories: Category[], category: CategoryFilter) =>
  category === "all" || categories.includes(category);

export const matchesQuery = (query: string, ...texts: string[]) => {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" || texts.some((text) => text.toLowerCase().includes(needle))
  );
};

/**
 * The rows that pass the filter. A search that matches only some of a platform's uploads keeps
 * just those uploads.
 */
export const filterConfiguredRows = (
  rows: ConfiguredRow[],
  { category, query }: ConnectorFilter,
): ConfiguredRow[] =>
  rows.flatMap((row): ConfiguredRow[] => {
    if (!inCategory(categoriesOf(row), category)) return [];
    if (row.kind === "integration") {
      const { integration } = row;
      return matchesQuery(
        query,
        integration.name,
        integration.platformLabel,
        ...integration.resourceSyncs.map((sync) => streamName(sync.resource)),
      )
        ? [row]
        : [];
    }
    if (matchesQuery(query, row.catalogEntry.displayName)) return [row];
    const uploads = row.uploads.filter((upload) =>
      matchesQuery(query, upload.name),
    );
    return uploads.length > 0 ? [{ ...row, uploads }] : [];
  });
