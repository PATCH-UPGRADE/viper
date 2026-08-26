import type { UrlBuilders } from "./types";

/**
 * Resolve a record's outbound links.
 *
 *   api = the module's `apiUrlFor` ?? `mapping.upstreamApi`
 *   web = the module's `webUrlFor` ?? `mapping.webUrl` ?? the api URL
 */

export interface UrlBearingMapping {
  /** Needed only to call a builder; stored-URL resolution ignores it. */
  externalId?: string;
  upstreamApi: string | null;
  webUrl: string | null;
}

/**
 * The select every `External*Mapping` include needs: enough for
 * `mappingUrlExtension` to resolve the urls server-side (`externalId` plus the
 * integration's platform) and for `ExternalMappingList` to render them.
 */
export const externalMappingSelect = {
  select: {
    externalId: true,
    upstreamApi: true,
    webUrl: true,
    integration: { select: { id: true, name: true, platform: true } },
  },
} as const;

/** The same, plus what a drawer shows: the row id and its last sync time. */
export const externalMappingWithSyncSelect = {
  select: {
    ...externalMappingSelect.select,
    id: true,
    lastSynced: true,
  },
} as const;

export interface ResolveUrlOptions {
  /**
   * When false, resolve to null rather than falling back to the API endpoint.
   * Callers that render the web and API urls side by side want this, so a
   * mapping with no stored `webUrl` shows one link instead of the same url
   * twice.
   */
  fallbackToUpstreamApi?: boolean;
}

/** The API endpoint: derived if the platform can, else whatever was stored. */
export const resolveUpstreamApi = <TConfig = unknown>(
  mappings: readonly UrlBearingMapping[] | undefined,
  builders?: UrlBuilders<TConfig>,
  config?: TConfig,
): string | null => {
  if (builders?.apiUrlFor && config !== undefined) {
    for (const mapping of mappings ?? []) {
      if (!mapping.externalId) continue;
      const derived = builders.apiUrlFor(mapping.externalId, config);
      if (derived) return derived;
    }
  }
  return mappings?.find((m) => m.upstreamApi)?.upstreamApi ?? null;
};

/**
 * Where a human should look. Prefers a real web URL, falling back to the API
 * endpoint unless `options.fallbackToUpstreamApi` is false.
 */
export const resolveWebUrl = <TConfig = unknown>(
  mappings: readonly UrlBearingMapping[] | undefined,
  builders?: UrlBuilders<TConfig>,
  config?: TConfig,
  options?: ResolveUrlOptions,
): string | null => {
  if (builders?.webUrlFor && config !== undefined) {
    for (const mapping of mappings ?? []) {
      if (!mapping.externalId) continue;
      const derived = builders.webUrlFor(mapping.externalId, config);
      if (derived) return derived;
    }
  }
  const stored = mappings?.find((m) => m.webUrl)?.webUrl;
  if (stored) return stored;
  if (options?.fallbackToUpstreamApi === false) return null;
  return resolveUpstreamApi(mappings, builders, config);
};
