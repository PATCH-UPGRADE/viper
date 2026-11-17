"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import type { CatalogEntry } from "../core/catalog";
import { useSuspenseIntegrationSuggestions } from "../hooks/use-integrations";
import {
  type ConnectorFilter,
  inCategory,
  matchesQuery,
} from "./configured-rows";
import { PlatformAddAction } from "./integrations-catalog";

/** Hidden entirely when nothing is suggested, or nothing suggested passes the filter. */
export const SuggestedIntegrations = ({
  catalog,
  filter,
}: {
  catalog: CatalogEntry[];
  filter: ConnectorFilter;
}) => {
  const { data: suggestions } = useSuspenseIntegrationSuggestions();
  const cards = suggestions.flatMap((suggestion) => {
    const entry = catalog.find((e) => e.platform === suggestion.platform);
    if (!entry) return [];
    const passes =
      inCategory(entry.categories, filter.category) &&
      matchesQuery(filter.query, entry.displayName, suggestion.reason);
    return passes ? [{ entry, reason: suggestion.reason }] : [];
  });
  if (cards.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SettingsSubheader
        title="Suggested for you"
        description="Based on information we've collected about your hospital environment."
      />
      <div className="card-grid gap-3">
        {cards.map(({ entry, reason }) => (
          <Card
            key={entry.platform}
            className="gap-2 bg-muted p-4 dark:bg-accent"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary-text">
              Suggested integration
            </p>
            <CardTitle>{entry.displayName}</CardTitle>
            <CardDescription>{reason}</CardDescription>
            <div className="pt-2">
              <PlatformAddAction entry={entry} addedCount={0} />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
};
