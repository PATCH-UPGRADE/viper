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
 * endpoint
 */
export const resolveWebUrl = <TConfig = unknown>(
  mappings: readonly UrlBearingMapping[] | undefined,
  builders?: UrlBuilders<TConfig>,
  config?: TConfig,
): string | null => {
  if (builders?.webUrlFor && config !== undefined) {
    for (const mapping of mappings ?? []) {
      if (!mapping.externalId) continue;
      const derived = builders.webUrlFor(mapping.externalId, config);
      if (derived) return derived;
    }
  }
  return (
    mappings?.find((m) => m.webUrl)?.webUrl ??
    resolveUpstreamApi(mappings, builders, config)
  );
};
