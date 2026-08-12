import { z } from "zod";
import { ResourceType } from "@/generated/prisma";
import type { AnyConnectorModule, ResourceModule } from "../types";

/**
 * Which resources does an integration sync, and which module handles each?
 */

const MODULE_FIELDS = [
  { field: "workOrders", resource: ResourceType.WorkOrder },
  { field: "assets", resource: ResourceType.Asset },
  { field: "notifications", resource: ResourceType.SourceRecord },
] as const satisfies ReadonlyArray<{
  field: keyof AnyConnectorModule;
  resource: ResourceType;
}>;

/**
 * A generic platform's resource lives in its config.
 */
export const genericConfigSchema = z.object({
  resource: z.enum(ResourceType),
});

/** Does this platform speak its own protocol (Fleet) or ours (ai/partner)? */
export const hasResourceModules = (module: AnyConnectorModule): boolean =>
  MODULE_FIELDS.some(({ field }) => Boolean(module[field]));

export const moduleForResource = (
  module: AnyConnectorModule,
  resource: ResourceType,
): ResourceModule<unknown, unknown, unknown> | undefined => {
  const entry = MODULE_FIELDS.find((f) => f.resource === resource);
  if (!entry) return undefined;
  return module[entry.field] as
    | ResourceModule<unknown, unknown, unknown>
    | undefined;
};

/**
 * ResourceModules present -> returns one resource per module field.
 * None -> generic platform, returns `config.resource`.
 */
export const resourcesFor = (
  module: AnyConnectorModule,
  config: unknown,
): ResourceType[] => {
  const fromModules: ResourceType[] = [];
  for (const { field, resource } of MODULE_FIELDS) {
    if (module[field]) fromModules.push(resource);
  }

  if (fromModules.length > 0) return fromModules;

  // Fails loudly rather than returning [] and silently never syncing.
  return [genericConfigSchema.parse(config).resource];
};
