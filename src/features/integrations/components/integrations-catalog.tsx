"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { CATEGORIES, type Category } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";

// Which platforms show under which section is each platform's own call
// (`categories` on its ConnectorDefinition) — this is UI-only metadata for
// the sections themselves, not platform membership.
const SECTION_META: Record<Category, { subtitle: string }> = {
  "Hospital Inventory": {
    subtitle: "Bring your asset inventory into VIPER.",
  },
  "Vulnerability Management Platforms": {
    subtitle: "Import vulnerability data from scanners and advisory feeds.",
  },
  "Ticketing Platforms": {
    subtitle: "Route findings and work orders to your ticketing system.",
  },
  Notifications: {
    subtitle:
      "Get notified about new advisories, recalls, and platform events.",
  },
};

const PlatformCard = ({ entry }: { entry: CatalogEntry }) => (
  <Card className="p-0 gap-0 overflow-hidden">
    <div className="flex items-center gap-3 p-4">
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
      <CreateIntegrationDialog entry={entry} />
    </div>
  </Card>
);

const CategorySection = ({
  category,
  catalog,
}: {
  category: Category;
  catalog: CatalogEntry[];
}) => {
  const meta = SECTION_META[category];
  const entries = catalog.filter((entry) =>
    entry.categories.includes(category),
  );
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <SettingsSubheader title={category} description={meta.subtitle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map((entry) => (
          <PlatformCard key={entry.platform} entry={entry} />
        ))}
      </div>
    </div>
  );
};

export const IntegrationsCatalog = ({
  catalog,
  category,
}: {
  catalog: CatalogEntry[];
  category?: Category;
}) => {
  const categories = category ? [category] : CATEGORIES;

  return (
    <div className="flex flex-col gap-10 flex-1 min-w-0">
      {categories.map((name) => (
        <CategorySection key={name} category={name} catalog={catalog} />
      ))}
    </div>
  );
};

export const IntegrationsCatalogContainer = ({
  catalog,
}: {
  catalog: CatalogEntry[];
}) => {
  return (
    <div className={cn(mainPadding, "flex flex-col gap-4")}>
      <SettingsSubheader
        title="Integrations"
        description="Manage external integrations to sync assets and vulnerabilities"
      />
      <IntegrationsCatalog catalog={catalog} />
    </div>
  );
};
