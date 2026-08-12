import type { UrlBuilders } from "./types";

/**
 * Resolve a record's outbound links.
 *
 *   api = the module's `apiUrlFor` ?? `mapping.upstreamApi`
 *   web = the module's `webUrlFor` ?? `mapping.webUrl` ?? the api URL
 *
 * The two branches never collide: a code-defined platform (Fleet) derives its
 * URLs and stores nothing, while a generic platform (ai/partner) stores what it
 * was given and derives nothing.
 *
 * `UrlBuilders` is a **parameter, not a registry lookup**, and this module is
 * deliberately not `server-only`. Looking the platform up here would pull
 * `registry -> platforms/* -> core/callback -> @/lib/tokens -> @/lib/db` into
 * every client component that renders a link.
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
 * endpoint — which is what the UI linked to before this refactor, and is the
 * regression `webUrlFor` fixes once a platform implements it.
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
