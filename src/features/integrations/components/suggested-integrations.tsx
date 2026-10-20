"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import type { CatalogEntry } from "../core/catalog";
import { useSuspenseIntegrationSuggestions } from "../hooks/use-integrations";
import { PlatformAddAction } from "./integrations-catalog";

export const SuggestedIntegrations = ({
  catalog,
}: {
  catalog: CatalogEntry[];
}) => {
  const { data: suggestions } = useSuspenseIntegrationSuggestions();
  const cards = suggestions.flatMap((suggestion) => {
    const entry = catalog.find((e) => e.platform === suggestion.platform);
    return entry ? [{ entry, reason: suggestion.reason }] : [];
  });
  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <SettingsSubheader
        title="Suggested for you"
        description="Based on activity we've seen on your network."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <PlatformAddAction entry={entry} added={false} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
