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
import { cn, humanize } from "@/lib/utils";
import { usesGenericAuth } from "../core/credentials";
import { registry } from "../core/registry";
import { genericConfigSchema } from "../core/sync/resources";
import type { AnyConnectorModule } from "../core/types";
import { CATEGORIES, type Category, type FieldSpec } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";

// Which platforms show under which section is each platform's own call
// (`categories` on its ConnectorDefinition) — this is UI-only metadata for
// the sections themselves, not platform membership.
const SECTION_META: Record<Category, { icon: LucideIcon; subtitle: string }> = {
  "Hospital Inventory": {
    icon: ComputerIcon,
    subtitle: "Import asset and device inventory from hospital vendor systems",
  },
  "Vulnerability Management Platforms": {
    icon: BugIcon,
    subtitle: "Import vulnerability data from scanners and advisory feeds",
  },
  "Ticketing Platforms": {
    icon: ListChecksIcon,
    subtitle: "Send and receive work orders with your ticketing system",
  },
  Notifications: {
    icon: InboxIcon,
    subtitle: "Receive advisories and alerts as they're published",
  },
  "Custom Integrations": {
    icon: PlugIcon,
    subtitle: "Connect any REST API, or let AI figure it out",
  },
};

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

// biome-ignore-start lint/suspicious/noExplicitAny: introspecting Zod's own internals (shape/unwrap/options) — `unknown` does not expose them, same tradeoff as AnyConnectorModule in core/types.ts.
const fieldSpecsFor = (schema: z.ZodTypeAny): FieldSpec[] =>
  Object.entries(shapeOf(schema)).map(([key, field]) => {
    const optional = field.isOptional();
    const required = !optional;
    const inner: any = optional ? (field as any).unwrap() : field;
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
  const modules = Object.values(registry) as AnyConnectorModule[];

  const sections = CATEGORIES.map((name) => ({
    name,
    ...SECTION_META[name],
    cards: modules
      .filter((module) => module.definition.categories.includes(name))
      .map((module) => {
        const { definition } = module;
        return {
          platform: definition.platform,
          displayName: definition.displayName,
          summary: configSummary(module),
          configFields: fieldSpecsFor(definition.configSchema),
          credentialFields: fieldSpecsFor(definition.credentialSchema),
          credentialsAreAuthShaped: usesGenericAuth(
            definition.credentialSchema,
          ),
        };
      }),
  })).filter((section) => section.cards.length > 0);

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
