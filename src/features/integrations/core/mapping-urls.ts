import { type PlatformEnum, Prisma, ResourceType } from "@/generated/prisma";
import type { UrlBuilders } from "./types";
import { resolveUpstreamApi, resolveWebUrl } from "./urls";

/**
 * Fill in each `External*Mapping`'s urls from the platform module that owns it.
 *
 * Helper for a prisma query extension.
 *
 * Prisma query extensions fire on the *top-level* operation only, so rather
 * than hooking every model that can nest one of these (issue -> asset ->
 * externalMappings, and so on) this reads the query's own `select` / `include`
 * tree to find where mappings will land.
 *
 * The tree is walked against Prisma's DMMF rather than by matching relation
 * names, because names are ambiguous in this schema: `assets` is `Asset[]` on
 * `Issue`, `AssetTicket[]` on `WorkOrderTicket` and `NotificationAssetMapping[]`
 * on `SourceRecord`. Resolving each hop through the DMMF gives the mapping
 * model exactly, and the table below is then keyed on something unambiguous.
 */

/** Mapping model -> the resource whose module builds its urls. Total over the schema. */
const RESOURCE_BY_MAPPING_MODEL: Record<string, ResourceType> = {
  ExternalAssetMapping: ResourceType.Asset,
  ExternalVulnerabilityMapping: ResourceType.Vulnerability,
  ExternalRemediationMapping: ResourceType.Remediation,
  ExternalDeviceArtifactMapping: ResourceType.DeviceArtifact,
  ExternalWorkOrderMapping: ResourceType.WorkOrder,
  ExternalSourceRecordMapping: ResourceType.SourceRecord,
};

export interface IntegrationUrlContext {
  platform: PlatformEnum;
  config: unknown;
}

/** Where one mapping array lands in the result, and what builds its urls. */
export interface MappingPath {
  /** Relation field names from the result root. Empty = the root is a mapping. */
  path: string[];
  resource: ResourceType;
}

type Row = Record<string, unknown>;

const isRecord = (value: unknown): value is Row =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

/** `"Model.field"` -> target model, for every relation in the schema. Built once. */
let relationIndex: Map<string, string> | undefined;

const relationTarget = (model: string, field: string): string | undefined => {
  if (!relationIndex) {
    relationIndex = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      for (const f of m.fields) {
        if (f.kind === "object")
          relationIndex.set(`${m.name}.${f.name}`, f.type);
      }
    }
  }
  return relationIndex.get(`${model}.${field}`);
};

const walk = (
  model: string,
  args: unknown,
  prefix: string[],
  out: MappingPath[],
): void => {
  if (!isRecord(args)) return;

  // Only selections. `where` / `data` / `orderBy` can mention a relation without
  // ever putting it in the result, and must not arm this.
  for (const key of ["select", "include"] as const) {
    const node = args[key];
    if (!isRecord(node)) continue;

    for (const [field, value] of Object.entries(node)) {
      if (value === false || value == null) continue;

      const target = relationTarget(model, field);
      if (!target) continue; // a scalar, or a field the DMMF does not know

      const path = [...prefix, field];
      const resource = RESOURCE_BY_MAPPING_MODEL[target];
      if (resource) {
        out.push({ path, resource });
        continue; // mappings own no nested mappings
      }
      if (isRecord(value)) walk(target, value, path, out);
    }
  }
};

/**
 * Which mapping arrays will this query actually return? Empty means the query
 * selects none, and is the signal to leave the result completely alone.
 */
export const mappingPaths = (
  model: string | undefined,
  args: unknown,
): MappingPath[] => {
  if (!model) return [];

  const out: MappingPath[] = [];
  const rootResource = RESOURCE_BY_MAPPING_MODEL[model];
  if (rootResource) out.push({ path: [], resource: rootResource });
  walk(model, args, [], out);
  return out;
};

/** Every node at `path`, descending through arrays on the way. */
const collectAt = (
  node: unknown,
  path: readonly string[],
  out: Row[],
): void => {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectAt(item, path, out);
    return;
  }
  if (!isRecord(node)) return;
  if (path.length === 0) {
    out.push(node);
    return;
  }
  collectAt(node[path[0]], path.slice(1), out);
};

/**
 * Resolves in place. Only overwrites `upstreamApi` / `webUrl` when the caller
 * actually selected them, so a narrower select keeps its shape.
 */
export const attachMappingUrls = async (
  result: unknown,
  paths: readonly MappingPath[],
  loadIntegrations: (
    ids: string[],
  ) => Promise<Map<string, IntegrationUrlContext>>,
  resolveBuilders: (
    platform: PlatformEnum,
    resource: ResourceType,
  ) => Promise<UrlBuilders<unknown> | undefined>,
): Promise<void> => {
  const found: { mappings: Row[]; resource: ResourceType }[] = [];
  for (const { path, resource } of paths) {
    const mappings: Row[] = [];
    collectAt(result, path, mappings);
    if (mappings.length > 0) found.push({ mappings, resource });
  }
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
  // Without the integration there is no platform, so nothing can be derived.
  if (integrationIds.size === 0) return;

  const integrations = await loadIntegrations([...integrationIds]);

  for (const { mappings, resource } of found) {
    for (const mapping of mappings) {
      const integration = mapping.integration;
      if (!isRecord(integration) || typeof integration.id !== "string")
        continue;

      const context = integrations.get(integration.id);
      if (!context) continue;

      const builders = await resolveBuilders(context.platform, resource);
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

      // replace the returned upstream api, if present, according to the url
      // builder for the platform if present
      if ("upstreamApi" in mapping) {
        mapping.upstreamApi = resolveUpstreamApi(stored, builders, config);
      }
      if ("webUrl" in mapping) {
        mapping.webUrl = resolveWebUrl(stored, builders, config, {
          fallbackToUpstreamApi: false,
        });
      }
    }
  }
};
