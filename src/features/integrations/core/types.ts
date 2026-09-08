/**
 * A Platform is a module of code that handles everything about one kind of
 * integration — auth, what it syncs, where its records live. An `Integration`
 * row is just an instance of one, naming its platform via `PlatformEnum`.
 */

import type { z } from "zod";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
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
 * Everything one resource-module sync attempt needs.
 * Assumed it uses the platform createSession module
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
 * Extend with resource for generic platforms
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
 * `TDraft` is what we send when we create a record, and it defaults to
 * `TCanonical` for a resource that reads and writes the same shape. They differ
 * whenever the canonical shape carries facts that only exist after the record
 * does — an external id, or the raw record the platform returned.
 */
export interface ResourceModule<
  TCanonical,
  TRaw = unknown,
  TConfig = unknown,
  TCreds = unknown,
  TDraft = TCanonical,
> extends UrlBuilders<TConfig> {
  /** How this resource syncs, end to end. May use the below as helpers */
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
    draft: TDraft,
    config: TConfig,
  ): Promise<{ externalId: string; raw: unknown }>;
  update?(
    session: Session,
    externalId: string,
    patch: Partial<TDraft>,
    config: TConfig,
  ): Promise<{ externalId: string; raw: unknown }>;

  /**
   * Only for a `notifications` module: how a snapshot this resource recorded
   * becomes a Notification. Declaring it is what lets the generic
   * `process-source-record` job handle this platform without naming it.
   */
  sourceRecords?: SourceRecordAdapter;

  /** How this platform's comments on this resource are read and written. */
  comments?: CommentsApi<TConfig, TCreds>;

  /** How questions to the manufacturer about this resource are raised. */
  inquiries?: InquiriesApi<TConfig, TCreds>;

  /** how often this resource should sync, in seconds. null = no opinion. */
  defaultSyncEvery: number | null;
}

/**
 * What a platform needs to make one call on behalf of an integration, outside
 * a sync. Same two pieces a `SyncCtx` carries, minus everything a sync attempt
 * owns — there is no cursor and no watermark when a person is waiting.
 */
export interface PlatformCallCtx<TConfig = unknown, TCreds = unknown> {
  config: TConfig;
  creds: TCreds;
}

/** One comment as it exists on the platform. */
export interface ExternalComment {
  externalId: string;
  /**
   * Opaque author handle. Stable within one record and uncorrelated across
   * records by design, so it is never a user id and never a profile link.
   */
  pseudonym: string;
  body: string;
  createdAt: string;
}

export interface ExternalCommentPage {
  items: ExternalComment[];
  /** Opaque; hand it back to read the next page. null = end of stream. */
  nextCursor: string | null;
}

/**
 * Reading and writing the comments a platform keeps against one of its records.
 *
 * Declared on the resource module that owns those records, so a caller reaches
 * it through the registry and never names a platform. Absent means the platform
 * has no comment surface, which is not an error.
 */
export interface CommentsApi<TConfig = unknown, TCreds = unknown> {
  list(
    ctx: PlatformCallCtx<TConfig, TCreds>,
    externalId: string,
    cursor?: string | null,
  ): Promise<ExternalCommentPage>;

  create(
    ctx: PlatformCallCtx<TConfig, TCreds>,
    externalId: string,
    draft: {
      body: string;
      /**
       * Our own stable identifier for the person writing. The platform derives
       * its pseudonym from this, so a value that changes splits that person's
       * thread in two.
       */
      authorExternalUserId: string;
    },
  ): Promise<ExternalComment>;
}

/** One inquiry we raised with a manufacturer, and their answer if it has come. */
export interface ExternalInquiry {
  externalId: string;
  body: string;
  /** The platform's own vocabulary; kept as sent rather than narrowed. */
  status: string | null;
  /** The manufacturer's answer. Single-response in the current contract. */
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface ExternalInquiryPage {
  items: ExternalInquiry[];
  nextCursor: string | null;
}

/**
 * Questions we put to a manufacturer about one of their records.
 *
 * The mirror image of `CommentsApi`, and deliberately not merged with it. A
 * comment is pseudonymous and shared with every consumer; an inquiry is
 * attributed and private, scoped to the token that raised it, because a
 * question needs an answer and an answer needs somebody to answer.
 */
export interface InquiriesApi<TConfig = unknown, TCreds = unknown> {
  list(
    ctx: PlatformCallCtx<TConfig, TCreds>,
    externalId: string,
    cursor?: string | null,
  ): Promise<ExternalInquiryPage>;

  create(
    ctx: PlatformCallCtx<TConfig, TCreds>,
    externalId: string,
    draft: { body: string },
  ): Promise<ExternalInquiry>;
}

export interface ConnectorDefinition<TConfig, TCreds> {
  platform: PlatformEnum;
  displayName: string;
  /** Shown on the platform's catalog card. */
  description: string;
  /** Which connectors-dashboard sections this platform shows under. */
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
  remediations?: ResourceModule<unknown, unknown, TConfig, TCreds>;
  notifications?: ResourceModule<unknown, unknown, TConfig, TCreds>;
}

/**
 * The erased module type, for the registry and for core helpers that must hold
 * modules of differing `TConfig`/`TCreds` side by side.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `unknown` does not erase zod's invariant internals.
export type AnyConnectorModule = ConnectorModule<any, any>;
