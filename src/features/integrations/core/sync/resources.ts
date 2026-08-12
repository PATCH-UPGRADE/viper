import { z } from "zod";
import { ResourceType } from "@/generated/prisma";
import type { AnyConnectorModule, ResourceModule } from "../types";

/**
 * Which resources does an integration sync, and which module handles each?
 *
 * `ResourceModule`s are named fields rather than a `ResourceType`-keyed map
 * (deliberate — see the RFC's Ground rules), which means core needs a
 * field -> ResourceType mapping. It lives here, in exactly one place, so adding
 * a field means editing one array.
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
 * A generic platform's resource lives in its config. Parsing it here makes that
 * a validated contract rather than a silent convention.
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
 * ResourceModules present -> one resource per module field.
 * None -> generic platform, so the resource is `config.resource`.
 *
 * There is no `resourcesFor` hook on the module: the *absence* of
 * ResourceModule fields is itself the signal that a platform is generic. A
 * per-module hook would return a 1-element array for every implementor.
 */
export const resourcesFor = (
  module: AnyConnectorModule,
  config: unknown,
): ResourceType[] => {
  // A plain loop rather than map+filter: `.filter(Boolean)` does not narrow, and
  // a type predicate can't widen the literal union `map` produces back to
  // `ResourceType`.
  const fromModules: ResourceType[] = [];
  for (const { field, resource } of MODULE_FIELDS) {
    if (module[field]) fromModules.push(resource);
  }

  if (fromModules.length > 0) return fromModules;

  // Fails loudly rather than returning [] and silently never syncing.
  return [genericConfigSchema.parse(config).resource];
};
