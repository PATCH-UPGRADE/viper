/**
 * A Platform is a module of code that handles everything about one kind of
 * integration — auth, what it syncs, where its records live. An `Integration`
 * row is just an instance of one, naming its platform via `PlatformEnum`.
 */

import type { z } from "zod";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";
import type { Category } from "../types";

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
 * A platform owns whatever client its methods need, including the session abstraction
 */
export interface Session {
  request(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Everything one resource-module sync attempt needs. No `resource`: a resource
 * module already knows which one it is.
 *
 * No session either. A resource module builds its own from `creds` using its
 * platform's auth helpers; if a platform wants one login shared across its
 * resources, memoizing is that platform's business, not core's.
 */
export interface ResourceSyncCtx<TConfig = unknown, TCreds = unknown> {
  integrationId: string;
  config: TConfig;
  /** `ai` forwards these to n8n, which authenticates as us. That is the point. */
  creds: TCreds;
  cursor: Cursor | null;
  /** Where `partner`'s `since` comes from. */
  lastSuccessfulSync: Date | null;
  /** Mints a one-time upload token scoped to the shadow user + resource. */
  callback(): Promise<CallbackConfig>;
}

/**
 * Everything one platform-level `(integration, resource)` sync attempt needs.
 *
 * Extends the resource-level context so core can build one object and hand it to
 * either kind of sync.
 */
export interface SyncCtx<TConfig = unknown, TCreds = unknown>
  extends ResourceSyncCtx<TConfig, TCreds> {
  resource: ResourceType;
}

/**
 * What a strategy reports back.
 */
export interface SyncOutcome {
  cursor: Cursor | null;
  pending?: boolean;
}

/**
 * A platform-level strategy owns one `(integration, resource)` sync attempt end
 * to end. Only for platforms with no resource modules — a platform that has them
 * syncs per resource instead.
 */
export type SyncStrategy<TConfig = unknown, TCreds = unknown> = (
  ctx: SyncCtx<TConfig, TCreds>,
) => Promise<SyncOutcome>;

/**
 * The per-resource half of a platform whose protocol *we* speak.
 *
 * `sync` is the contract: declaring a resource module means that module knows how
 * to sync itself. The pull helpers below are the pieces a `sync` is usually built
 * out of, not required 
 */
export interface ResourceModule<
  TCanonical,
  TRaw = unknown,
  TConfig = unknown,
  TCreds = unknown,
> extends UrlBuilders<TConfig> {
  /** How this resource syncs, end to end. */
  sync(ctx: ResourceSyncCtx<TConfig, TCreds>): Promise<SyncOutcome>;

  // we pull from their platform
  listChanged?(
    session: Session,
    cursor: Cursor | null,
  ): AsyncIterable<Page<TRaw>>;
  get?(session: Session, externalId: string): Promise<TRaw>;
  toCanonical?(raw: TRaw, config: TConfig): TCanonical;

  // we push to their platform
  create?(
    session: Session,
    draft: TCanonical,
  ): Promise<{ externalId: string; raw: TRaw }>;
  update?(
    session: Session,
    externalId: string,
    patch: Partial<TCanonical>,
  ): Promise<{ externalId: string; raw: TRaw }>;

  /** how often this resource should sync, in seconds. null = no opinion. */
  defaultSyncEvery: number | null;
}

export interface ConnectorDefinition<TConfig, TCreds> {
  platform: PlatformEnum;
  displayName: string;
  /** Shown on the platform's catalog card. */
  description: string;
  /** Which connectors-catalog sections this platform shows under. */
  categories: Category[];
  /** Validates `Integration.config`. */
  configSchema: z.ZodType<TConfig>;
  /** Validates the decrypted `Integration.credentials`. */
  credentialSchema: z.ZodType<TCreds>;
}

/**
 * A platform must supply *either* `sync` or at least one resource module. With
 * resource modules, core dispatches to the one that owns the resource; without
 * them, it falls back to `sync`.
 */
export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;

  /**
   * How this platform syncs, end to end, when it has no resource modules. A
   * pusher fires one request and returns `pending: true` so the row stays
   * `Pending` until the callback lands.
   */
  sync?: SyncStrategy<TConfig, TCreds>;
  onCreate?(): Promise<void>;
  workOrders?: ResourceModule<unknown, unknown, TConfig, TCreds>;
  assets?: ResourceModule<unknown, unknown, TConfig, TCreds>;
  notifications?: ResourceModule<unknown, unknown, TConfig, TCreds>;
}

/**
 * The erased module type, for the registry and for core helpers that must hold
 * modules of differing `TConfig`/`TCreds` side by side.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `unknown` does not erase zod's invariant internals.
export type AnyConnectorModule = ConnectorModule<any, any>;
