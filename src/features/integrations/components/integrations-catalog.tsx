"use client";

import {
  BugIcon,
  ComputerIcon,
  InboxIcon,
  ListChecksIcon,
  type LucideIcon,
} from "lucide-react";
import { EmptyView } from "@/components/entity-components";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { initialsOf } from "@/lib/string-utils";
import type { CatalogEntry } from "../core/catalog";
import type { Category, IntegrationListItem } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";
import { IntegrationCard } from "./integration-row";

// Which platforms show under which section is each platform's own call
// (`categories` on its ConnectorDefinition) — this is UI-only metadata for
// the sections themselves, not platform membership.
export const SECTION_META: Record<
  Category,
  { icon: LucideIcon; subtitle: string }
> = {
  "Hospital Inventory": {
    icon: ComputerIcon,
    subtitle: "Bring your asset inventory into VIPER.",
  },
  "Vulnerability Management Platforms": {
    icon: BugIcon,
    subtitle: "Import vulnerability data from scanners and advisory feeds.",
  },
  "Ticketing Platforms": {
    icon: ListChecksIcon,
    subtitle: "Route findings and work orders to your ticketing system.",
  },
  Notifications: {
    icon: InboxIcon,
    subtitle:
      "Get notified about new advisories, recalls, and platform events.",
  },
};

const PlatformCard = ({
  entry,
  instances,
}: {
  entry: CatalogEntry;
  instances: IntegrationListItem[];
}) => (
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

    {instances.length > 0 && (
      <div className="border-t divide-y">
        {instances.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>
    )}

    <div className="p-4 border-t">
      <CreateIntegrationDialog entry={entry} />
    </div>
  </Card>
);

export const CategoryCatalog = ({
  category,
  catalog,
  integrations,
}: {
  category: Category;
  catalog: CatalogEntry[];
  integrations: IntegrationListItem[];
}) => {
  const meta = SECTION_META[category];
  const entries = catalog.filter((entry) =>
    entry.categories.includes(category),
  );

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <SettingsSubheader title={category} description={meta.subtitle} />
      {entries.length === 0 ? (
        <EmptyView message={`No integrations available in ${category} yet.`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entries.map((entry) => (
            <PlatformCard
              key={entry.platform}
              entry={entry}
              instances={integrations.filter(
                (item) => item.platform === entry.platform,
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};
