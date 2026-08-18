import {
  BugIcon,
  ComputerIcon,
  InboxIcon,
  ListChecksIcon,
  type LucideIcon,
  PlugIcon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { PlatformEnum } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { registry } from "../core/registry";
import { genericConfigSchema } from "../core/sync/resources";
import type { AnyConnectorModule } from "../core/types";

interface PlatformCategory {
  icon: LucideIcon;
  subtitle: string;
  platforms: PlatformEnum[];
}

// TODO(VW-458): this categorization — which categories exist, their copy,
// and which platforms belong where — is this ticket's own read of Cassidy's
// design and needs her confirmation before shipping.
//
// FLEET is listed under 3 categories per the ticket's own example. That
// can't be derived from teamplayFleet's module today — it has no
// assets/workOrders/notifications ResourceModules wired up yet (see
// core/registry.ts + platforms/teamplay-fleet/index.ts), so there's no
// per-resource signal to split it by. Once those modules land, this should
// probably derive from `module.assets`/`module.workOrders`/
// `module.notifications` presence instead of being hand-listed here.
const categories: Record<string, PlatformCategory> = {
  "Hospital Inventory": {
    icon: ComputerIcon,
    subtitle: "Import asset and device inventory from hospital vendor systems",
    platforms: [PlatformEnum.FLEET],
  },
  "Vulnerability Management Platforms": {
    icon: BugIcon,
    subtitle: "Import vulnerability data from scanners and advisory feeds",
    platforms: [],
  },
  "Ticketing Platforms": {
    icon: ListChecksIcon,
    subtitle: "Send and receive work orders with your ticketing system",
    platforms: [PlatformEnum.FLEET],
  },
  Notifications: {
    icon: InboxIcon,
    subtitle: "Receive advisories and alerts as they're published",
    platforms: [PlatformEnum.FLEET],
  },
  "Custom Integrations": {
    icon: PlugIcon,
    subtitle: "Connect any REST API, or let AI figure it out",
    platforms: [PlatformEnum.PARTNER, PlatformEnum.AI],
  },
};

const humanize = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const configSummary = (module: AnyConnectorModule): string => {
  const { configSchema } = module.definition;
  const shape =
    "shape" in configSchema
      ? (configSchema.shape as Record<string, unknown>)
      : {};
  const fields = Object.keys(shape).filter(
    (key) => !(key in genericConfigSchema.shape),
  );
  return fields.length > 0
    ? `Requires ${fields.map(humanize).join(", ")}`
    : "No configuration required";
};

export const IntegrationsCatalogContainer = () => {
  return (
    <div className={cn(mainPadding, "flex flex-col gap-4")}>
      <SettingsSubheader
        title="Integrations"
        description="Manage external integrations to sync assets and vulnerabilities"
      />
      <IntegrationsCatalog />
    </div>
  );
};

const IntegrationsCatalog = () => {
  const sections = Object.entries(categories)
    .map(([name, { icon, subtitle, platforms }]) => ({
      name,
      icon,
      subtitle,
      cards: platforms.flatMap((platform) => {
        const module = registry[platform];
        return module
          ? [
              {
                platform,
                displayName: module.definition.displayName,
                summary: configSummary(module),
              },
            ]
          : [];
      }),
    }))
    .filter((section) => section.cards.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.name} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <section.icon className="size-4" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-sm">{section.name}</h3>
              <p className="text-sm text-muted-foreground">
                {section.subtitle}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.cards.map(({ platform, displayName, summary }) => (
              <Card key={platform}>
                <CardHeader>
                  <CardTitle>{displayName}</CardTitle>
                  <CardDescription>{summary}</CardDescription>
                  <CardAction>
                    <Button size="sm" disabled>
                      <PlusIcon /> Add
                    </Button>
                  </CardAction>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
