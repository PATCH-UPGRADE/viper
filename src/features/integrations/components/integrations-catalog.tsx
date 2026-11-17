"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { initialsOf } from "@/lib/string-utils";
import type { CatalogEntry } from "../core/catalog";
import { useAddedPlatformCounts } from "../hooks/use-integrations";
import { CATEGORIES, type Category } from "../types";
import {
  type ConnectorFilter,
  inCategory,
  matchesQuery,
} from "./configured-rows";
import { CreateIntegrationDialog } from "./create-integration-dialog";
import { PLATFORM_ADD_OVERRIDES } from "./platform-add-overrides";

const SECTION_SUBTITLES: Record<Category, string> = {
  "Hospital Inventory": "Bring your asset inventory into VIPER.",
  "Vulnerability Management Platforms":
    "Import vulnerability data from scanners and advisory feeds.",
  "Ticketing Platforms":
    "Route findings and work orders to your ticketing system.",
  Notifications:
    "Get notified about new advisories, recalls, and platform events.",
};

export const PlatformAddAction = ({
  entry,
  addedCount,
}: {
  entry: CatalogEntry;
  addedCount: number;
}) => {
  const PlatformAddButton = PLATFORM_ADD_OVERRIDES[entry.platform];
  return PlatformAddButton ? (
    <PlatformAddButton entry={entry} />
  ) : (
    <CreateIntegrationDialog entry={entry} addedCount={addedCount} />
  );
};

const PlatformCard = ({
  entry,
  addedCount,
}: {
  entry: CatalogEntry;
  addedCount: number;
}) => {
  return (
    <Card className="p-0 gap-0 overflow-hidden">
      {/* Grows to fill the card, so every card in a row puts its divider and button at the same height. */}
      <div className="flex flex-1 items-center gap-3 p-4">
        <Avatar className="size-9 shrink-0 rounded-md border">
          <AvatarFallback className="rounded-md bg-accent text-accent-foreground text-xs font-semibold">
            {initialsOf(entry.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <CardTitle>{entry.displayName}</CardTitle>
          <CardDescription>{entry.description}</CardDescription>
        </div>
      </div>
      <div className="p-4 border-t">
        <PlatformAddAction entry={entry} addedCount={addedCount} />
      </div>
    </Card>
  );
};

const CategorySection = ({
  category,
  catalog,
  query,
}: {
  category: Category;
  catalog: CatalogEntry[];
  query: string;
}) => {
  const addedCounts = useAddedPlatformCounts();
  const countOf = (entry: CatalogEntry) => addedCounts[entry.platform] ?? 0;
  const isFull = (entry: CatalogEntry) => entry.singleton && countOf(entry) > 0;

  // A card that cannot take another integration goes last. The sort is stable, so the rest keep catalog order.
  const entries = catalog
    .filter(
      (entry) =>
        entry.categories.includes(category) &&
        matchesQuery(query, entry.displayName, entry.description),
    )
    .sort((a, b) => Number(isFull(a)) - Number(isFull(b)));
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" data-section={category}>
      <SettingsSubheader
        title={category}
        description={SECTION_SUBTITLES[category]}
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
        {entries.map((entry) => (
          <PlatformCard
            key={entry.platform}
            entry={entry}
            addedCount={countOf(entry)}
          />
        ))}
      </div>
    </section>
  );
};

/** The platforms a hospital can add, one section per category, narrowed by the page's filter. */
export const IntegrationsCatalog = ({
  catalog,
  filter,
}: {
  catalog: CatalogEntry[];
  filter: ConnectorFilter;
}) => (
  <div className="flex flex-col gap-10">
    {CATEGORIES.filter((name) => inCategory([name], filter.category)).map(
      (name) => (
        <CategorySection
          key={name}
          category={name}
          catalog={catalog}
          query={filter.query}
        />
      ),
    )}
  </div>
);
