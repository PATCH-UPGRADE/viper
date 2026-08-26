import "server-only";
import { type PlatformEnum, ResourceType } from "@/generated/prisma";
import { moduleForResource } from "./sync/resources";
import { resolveUpstreamApi, resolveWebUrl } from "./urls";

/**
 * Fill in each `External*Mapping`'s urls from the platform module that owns it.
 *
 * The builders live on resource modules, reachable only through the `server-only`
 * registry, so this cannot run in the browser — the client just renders whatever
 * `webUrl` / `upstreamApi` it is handed. Prisma query extensions fire on the
 * *top-level* operation only, so rather than hooking every model that can nest
 * one of these (issue -> asset -> externalMappings, and so on) this walks the
 * materialized result and resolves every mapping array it finds.
 */

/** Relation field name -> the resource whose mappings hang beneath it. */
const RESOURCE_BY_RELATION: Record<string, ResourceType> = {
  asset: ResourceType.Asset,
  assets: ResourceType.Asset,
  vulnerability: ResourceType.Vulnerability,
  vulnerabilities: ResourceType.Vulnerability,
  remediation: ResourceType.Remediation,
  remediations: ResourceType.Remediation,
  deviceArtifact: ResourceType.DeviceArtifact,
  deviceArtifacts: ResourceType.DeviceArtifact,
  ticket: ResourceType.WorkOrder,
  workOrderTicket: ResourceType.WorkOrder,
  workOrderTickets: ResourceType.WorkOrder,
};

/** Prisma model name -> the resource, for the operation's own model. */
const RESOURCE_BY_MODEL: Record<string, ResourceType> = {
  Asset: ResourceType.Asset,
  Vulnerability: ResourceType.Vulnerability,
  Remediation: ResourceType.Remediation,
  DeviceArtifact: ResourceType.DeviceArtifact,
  WorkOrderTicket: ResourceType.WorkOrder,
};

export interface IntegrationUrlContext {
  platform: PlatformEnum;
  config: unknown;
}

type Row = Record<string, unknown>;

const isRecord = (value: unknown): value is Row =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

/**
 * Does this query ask for `externalMappings` at all? Checked against the args so
 * the result walk stays off every other query in the app.
 */
export const selectsExternalMappings = (args: unknown): boolean => {
  if (Array.isArray(args)) return args.some(selectsExternalMappings);
  if (!isRecord(args)) return false;
  for (const [key, value] of Object.entries(args)) {
    if (key === "externalMappings") return true;
    if (selectsExternalMappings(value)) return true;
  }
  return false;
};

interface FoundMappings {
  mappings: Row[];
  resource: ResourceType;
}

const collect = (
  node: unknown,
  resource: ResourceType | undefined,
  found: FoundMappings[],
): void => {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, resource, found);
    return;
  }
  if (!isRecord(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "externalMappings") {
      if (resource && Array.isArray(value)) {
        found.push({ mappings: value as Row[], resource });
      }
      continue;
    }
    // A nested relation renames the resource; anything else keeps the current one.
    collect(value, RESOURCE_BY_RELATION[key] ?? resource, found);
  }
};

/**
 * Resolves in place. Only overwrites `upstreamApi` / `webUrl` when the caller
 * actually selected them, so a narrower select keeps its shape.
 */
export const attachMappingUrls = async (
  result: unknown,
  model: string | undefined,
  loadIntegrations: (
    ids: string[],
  ) => Promise<Map<string, IntegrationUrlContext>>,
): Promise<void> => {
  const found: FoundMappings[] = [];
  collect(result, model ? RESOURCE_BY_MODEL[model] : undefined, found);
  if (found.length === 0) return;

  const integrationIds = new Set<string>();
  for (const { mappings } of found) {
    for (const mapping of mappings) {
      const integration = mapping.integration;
      if (isRecord(integration) && typeof integration.id === "string") {
        integrationIds.add(integration.id);
      }
    }
  }
  if (integrationIds.size === 0) return;

  // Deferred so `db.ts` can finish initializing: the registry pulls in platform
  // modules, some of which import the client this extension is installed on.
  const { registry } = await import("./registry");
  const integrations = await loadIntegrations([...integrationIds]);

  for (const { mappings, resource } of found) {
    for (const mapping of mappings) {
      const integration = mapping.integration;
      if (!isRecord(integration) || typeof integration.id !== "string")
        continue;

      const context = integrations.get(integration.id);
      if (!context) continue;

      const platformModule = registry[context.platform];
      if (!platformModule) continue;

      const builders = moduleForResource(platformModule, resource);
      if (!builders) continue;

      const stored = [
        {
          externalId:
            typeof mapping.externalId === "string"
              ? mapping.externalId
              : undefined,
          upstreamApi: (mapping.upstreamApi as string | null) ?? null,
          webUrl: (mapping.webUrl as string | null) ?? null,
        },
      ];
      const config = context.config ?? {};

      if ("upstreamApi" in mapping) {
        mapping.upstreamApi = resolveUpstreamApi(stored, builders, config);
      }
      if ("webUrl" in mapping) {
        // No API fallback: the two are rendered as separate links.
        mapping.webUrl = resolveWebUrl(stored, builders, config, {
          fallbackToUpstreamApi: false,
        });
      }
    }
  }
};
