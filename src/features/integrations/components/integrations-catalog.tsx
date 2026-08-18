import {
  BugIcon,
  ComputerIcon,
  InboxIcon,
  ListChecksIcon,
  type LucideIcon,
  PlugIcon,
} from "lucide-react";
import type { z } from "zod";
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
import type { FieldSpec } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";

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

const shapeOf = (schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> =>
  "shape" in schema ? (schema.shape as Record<string, z.ZodTypeAny>) : {};

const configSummary = (module: AnyConnectorModule): string => {
  const fields = Object.keys(shapeOf(module.definition.configSchema)).filter(
    (key) => !(key in genericConfigSchema.shape),
  );
  return fields.length > 0
    ? `Requires ${fields.map(humanize).join(", ")}`
    : "No configuration required";
};

/**
 * Reduce a platform's `configSchema`/`credentialSchema` to plain, serializable
 * field descriptions (Client Components can't receive a real Zod schema —
 * see FieldSpec's own doc comment) so the create-integration dialog can
 * render a field per key without importing platform code itself.
 */
// biome-ignore-start lint/suspicious/noExplicitAny: introspecting Zod's own internals (shape/unwrap/options) — `unknown` does not expose them, same tradeoff as AnyConnectorModule in core/types.ts.
const fieldSpecsFor = (schema: z.ZodTypeAny): FieldSpec[] =>
  Object.entries(shapeOf(schema)).map(([key, field]) => {
    const required = !field.isOptional();
    const inner: any = field.isOptional() ? (field as any).unwrap() : field;
    if (inner.def.type === "enum") {
      return { key, kind: "select" as const, required, options: inner.options };
    }
    if (inner.def.type === "number") {
      return { key, kind: "number", required };
    }
    const kind = /password|secret|token/i.test(key)
      ? ("password" as const)
      : /url|uri/i.test(key)
        ? ("url" as const)
        : ("text" as const);
    return { key, kind, required };
  });
// biome-ignore-end lint/suspicious/noExplicitAny: see comment above

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
        if (!module) return [];
        const { credentialSchema } = module.definition;
        return [
          {
            platform,
            displayName: module.definition.displayName,
            summary: configSummary(module),
            configFields: fieldSpecsFor(module.definition.configSchema),
            credentialFields: fieldSpecsFor(credentialSchema),
            credentialsAreAuthShaped: "authType" in shapeOf(credentialSchema),
          },
        ];
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
            {section.cards.map(
              ({
                platform,
                displayName,
                summary,
                configFields,
                credentialFields,
                credentialsAreAuthShaped,
              }) => (
                <Card key={platform}>
                  <CardHeader>
                    <CardTitle>{displayName}</CardTitle>
                    <CardDescription>{summary}</CardDescription>
                    <CardAction>
                      <CreateIntegrationDialog
                        platform={platform}
                        displayName={displayName}
                        configFields={configFields}
                        credentialFields={credentialFields}
                        credentialsAreAuthShaped={credentialsAreAuthShaped}
                      />
                    </CardAction>
                  </CardHeader>
                </Card>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
