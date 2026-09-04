"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { initialsOf } from "@/lib/string-utils";
import type { CatalogEntry } from "../core/catalog";
import { CATEGORIES, type Category } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";

const SECTION_SUBTITLES: Record<Category, string> = {
  "Hospital Inventory": "Bring your asset inventory into VIPER.",
  "Vulnerability Management Platforms":
    "Import vulnerability data from scanners and advisory feeds.",
  "Ticketing Platforms":
    "Route findings and work orders to your ticketing system.",
  Notifications:
    "Get notified about new advisories, recalls, and platform events.",
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
  const entries = catalog.filter((entry) =>
    entry.categories.includes(category),
  );
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <SettingsSubheader
        title={category}
        description={SECTION_SUBTITLES[category]}
      />
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
  register,
}: {
  catalog: CatalogEntry[];
  register: (category: Category) => (el: HTMLDivElement | null) => void;
}) => (
  <div className="flex flex-col gap-10 flex-1 min-w-0">
    {CATEGORIES.map((name) => (
      <div key={name} ref={register(name)} data-section={name}>
        <CategorySection category={name} catalog={catalog} />
      </div>
    ))}
    {/* Lets the last section scroll all the way to the top, like the others. */}
    <div className="min-h-[70vh]" aria-hidden="true" />
  </div>
);
