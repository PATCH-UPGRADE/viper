/**
 * What a Platform *is*.
 *
 * A Platform is a module of code that handles everything about one kind of
 * integration — auth, what it syncs, where its records live. An `Integration`
 * row is just an instance of one, naming its platform via `PlatformEnum`.
 *
 * This file is deliberately **not** `server-only`: `core/urls.ts` imports
 * `UrlBuilders` from here and is used by client components. Every import below
 * is `import type`, so nothing survives compilation into a bundle.
 */

import type { z } from "zod";
import type { PlatformEnum, ResourceType } from "@/generated/prisma";

/** An authenticated connection to an upstream platform. */
export interface Session {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  dispose?(): Promise<void>;
}

/**
 * Opaque to core: round-tripped through `IntegrationResourceSync.cursor` and
 * interpreted only by the platform that produced it. Version your cursors and
 * carry a tiebreaker alongside any timestamp — see the RFC's "Cursors".
 */
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

/**
 * Split out of `ResourceModule` so `core/urls.ts` can take them as a plain
 * parameter. A registry lookup inside `urls.ts` would drag the whole server-only
 * platform graph into any client component that renders a link.
 */
export interface UrlBuilders<TConfig = unknown> {
  /** What's the API URL for this record on their platform? */
  apiUrlFor?(externalId: string, config: TConfig): string | null;
  /** Where does a human look to find this record? */
  webUrlFor?(externalId: string, config: TConfig): string | null;
}

/**
 * One resource on a platform whose protocol *we* speak (Fleet, ServiceNow).
 * Platforms that speak *ours* (ai, partner) omit these entirely — see the
 * RFC's "Who speaks whose protocol".
 *
 * Credentials never reach here. A mapper that can read credentials is one
 * refactor away from logging them, and mappers have no use for them.
 */
export interface ResourceModule<TCanonical, TRaw = unknown, TConfig = unknown>
  extends UrlBuilders<TConfig> {
  // we pull from their platform
  listChanged(s: Session, cursor: Cursor | null): AsyncIterable<Page<TRaw>>;
  get(s: Session, externalId: string): Promise<TRaw>;
  toCanonical(raw: TRaw, config: TConfig): TCanonical;

  // we push to their platform
  create?(
    s: Session,
    draft: TCanonical,
  ): Promise<{ externalId: string; raw: TRaw }>;
  update?(
    s: Session,
    externalId: string,
    patch: Partial<TCanonical>,
  ): Promise<{ externalId: string; raw: TRaw }>;

  /** This resource's natural cadence, in seconds. null = no opinion. */
  defaultSyncEvery: number | null;
}

/**
 * Everything one `(integration, resource)` sync attempt needs.
 *
 * Row-level facts (`integrationId`, the shadow user) are deliberately absent:
 * they are captured by the `ingest` / `callback` closures, which core builds.
 * Credentials reach exactly two places — `createSession` and here.
 */
export interface SyncCtx<TConfig = unknown, TCreds = unknown> {
  config: TConfig;
  /** `ai` forwards these to n8n, which authenticates as us. That is the point. */
  creds: TCreds;
  resource: ResourceType;
  session: Session;
  cursor: Cursor | null;
  /** Where `partner`'s `since` comes from when there is no cursor yet. */
  lastSuccessfulSync: Date | null;
  /** Closes over the row, so attribution and mappings stay in core. */
  ingest(items: unknown[]): Promise<void>;
  /** Mints a one-time upload token scoped to the shadow user + resource. */
  callback(): Promise<CallbackConfig>;
}

/**
 * What a strategy reports back. The worker persists the cursor; `pending: true`
 * means the work finishes when a callback lands, so the row stays `Pending`.
 */
export interface SyncOutcome {
  cursor: Cursor | null;
  pending?: boolean;
}

/** A strategy owns one `(integration, resource)` sync attempt end to end. */
export type SyncStrategy<TConfig = unknown, TCreds = unknown> = (
  ctx: SyncCtx<TConfig, TCreds>,
) => Promise<SyncOutcome>;

/**
 * How change reaches us. Independent of each other:
 *   poll    — the cron schedules it                          (fleet, ai, partner)
 *   push    — data returns via our callback instead of us fetching (ai, partner)
 *   webhook — they notify us unprompted, nothing is scheduled
 *
 * `ai`/`partner` are `['poll', 'push']`: scheduled like any poller, but the tick
 * hands off rather than fetching. Drop `'poll'` and they'd never be scheduled.
 */
export type ChangeSource = "poll" | "push" | "webhook";

export interface ConnectorDefinition<TConfig, TCreds> {
  /** No free-text slug to drift from the enum. */
  platform: PlatformEnum;
  displayName: string;
  /** Validates `Integration.config`. */
  configSchema: z.ZodType<TConfig>;
  /** Validates the decrypted `Integration.credentials`. */
  credentialSchema: z.ZodType<TCreds>;
  changeSources: ReadonlyArray<ChangeSource>;
  /**
   * Connection-level rate-limit floor, in seconds. Enforced when the operator
   * saves the integration — before any resource is in scope, which is why it
   * lives here and `defaultSyncEvery` lives on the resource module.
   */
  minSyncEvery?: number;
}

export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;
  createSession(input: { config: TConfig; creds: TCreds }): Promise<Session>;

  /**
   * How this platform syncs. Omitted -> core's `pollSync` drives the
   * ResourceModules below. `ai`/`partner` set this and have no ResourceModules.
   */
  sync?: SyncStrategy<TConfig, TCreds>;

  workOrders?: ResourceModule<unknown, unknown, TConfig>;
  assets?: ResourceModule<unknown, unknown, TConfig>;
  notifications?: ResourceModule<unknown, unknown, TConfig>;
}

/**
 * The erased module type, for the registry and for core helpers that must hold
 * modules of differing `TConfig`/`TCreds` side by side.
 *
 * `ConnectorModule<unknown, unknown>` does not work: zod v4's `_zod` internals
 * are invariant, so `z.ZodType<AiConfig>` is not assignable to
 * `z.ZodType<unknown>`. Per-module type safety is unaffected — it is enforced at
 * each definition site (`export const ai: ConnectorModule<AiConfig, AiCreds>`).
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `unknown` does not erase zod's invariant internals.
export type AnyConnectorModule = ConnectorModule<any, any>;
