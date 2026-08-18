/**
 * A Platform is a module of code that handles everything about one kind of
 * integration — auth, what it syncs, where its records live. An `Integration`
 * row is just an instance of one, naming its platform via `PlatformEnum`.
 */

import type { z } from "zod";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";

/**
 * Opaque to core: round-tripped through `IntegrationResourceSync.cursor` and
 * interpreted only by the platform that produced it.
 */
// TODO: VW-431, use a cursor to store pagination logic when polling data from fleet?
// if you use it, great, keep it, if not, just delete it
export type Cursor = unknown;

export interface Page<TRaw> {
  items: TRaw[];
  /** The cursor to resume from *after* this page. null = end of stream. */
  cursor: Cursor | null;
}

/**
 * Where a platform pushes data back to us, and in what shape. Minted per sync
 * attempt by `core/callback.ts`; the token in `path` is single-use.
 */
export interface CallbackConfig {
  /** `${getBaseUrl()}/api/v1` */
  baseApiUrl: string;
  /** `/assets/integrationUpload/<raw-token>` */
  path: string;
  /** `baseApiUrl + path` */
  url: string;
  /** JSON Schema of the upload envelope for this resource. */
  schema: Record<string, unknown>;
}

// TODO: VW-433 Fleet should use this on resource modules
export interface UrlBuilders<TConfig = unknown> {
  /** What's the API URL for this record on their platform? */
  apiUrlFor?(externalId: string, config: TConfig): string | null;
  /** Where does a human look to find this record? */
  webUrlFor?(externalId: string, config: TConfig): string | null;
}

/**
 * One resource on a platform whose protocol *we* speak (Fleet, ServiceNow).
 * A platform owns whatever client its methods need, including session abstratction
 */
export interface ResourceModule<TCanonical, TRaw = unknown, TConfig = unknown>
  extends UrlBuilders<TConfig> {
  // we pull from their platform
  listChanged(cursor: Cursor | null): AsyncIterable<Page<TRaw>>;
  // TODO: VW-433: can change `listChanged` schema if it doesn't work for fleet
  get(externalId: string): Promise<TRaw>;
  toCanonical(raw: TRaw, config: TConfig): TCanonical;

  // we push to their platform
  create?(draft: TCanonical): Promise<{ externalId: string; raw: TRaw }>;
  update?(
    externalId: string,
    patch: Partial<TCanonical>,
  ): Promise<{ externalId: string; raw: TRaw }>;

  /** how often this resource should sync, in seconds. null = no opinion. */
  defaultSyncEvery: number | null;
}

/**
 * Everything one `(integration, resource)` sync attempt needs.
 */
export interface SyncCtx<TConfig = unknown, TCreds = unknown> {
  config: TConfig;
  /** `ai` forwards these to n8n, which authenticates as us. That is the point. */
  creds: TCreds;
  resource: ResourceType;
  cursor: Cursor | null;
  /** Where `partner`'s `since` comes from. */
  lastSuccessfulSync: Date | null;
  /** Mints a one-time upload token scoped to the shadow user + resource. */
  callback(): Promise<CallbackConfig>;
}

/**
 * What a strategy reports back.
 */
export interface SyncOutcome {
  cursor: Cursor | null;
  pending?: boolean;
}

/** A strategy owns one `(integration, resource)` sync attempt end to end. */
export type SyncStrategy<TConfig = unknown, TCreds = unknown> = (
  ctx: SyncCtx<TConfig, TCreds>,
) => Promise<SyncOutcome>;

export interface ConnectorDefinition<TConfig, TCreds> {
  platform: PlatformEnum;
  displayName: string;
  /** Validates `Integration.config`. */
  configSchema: z.ZodType<TConfig>;
  /** Validates the decrypted `Integration.credentials`. */
  credentialSchema: z.ZodType<TCreds>;
}

export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;

  /**
   * How this platform syncs, end to end. Whether it pulls or hands off is the
   * strategy's business: a puller loops and returns the cursor it reached, a
   * pusher fires one request and returns `pending: true` so the row stays
   * `Pending` until the callback lands.
   */
  sync: SyncStrategy<TConfig, TCreds>;
  onCreate?(): Promise<void>;
  workOrders?: ResourceModule<unknown, unknown, TConfig>;
  assets?: ResourceModule<unknown, unknown, TConfig>;
  notifications?: ResourceModule<unknown, unknown, TConfig>;
}

/**
 * The erased module type, for the registry and for core helpers that must hold
 * modules of differing `TConfig`/`TCreds` side by side.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `unknown` does not erase zod's invariant internals.
export type AnyConnectorModule = ConnectorModule<any, any>;
