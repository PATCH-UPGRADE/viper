# Viper Integrations Refactor RFC

## Why

Previously our integration code lived in multiple places, and did not reuse common things like sessions. Because integration logic was spread across our backend, it seemed like every integration was a hack. Finally, some of our db models seemed to have overlapping responsibilities.

This document describes first how VIPER integrations will be implemented *instead*, and then enumerates explicit changes from what we do today.

## General shape of this

* A Platform is a module of code that handles everything about an integration (say, work orders, assets, notifications, authentication). A platform defines what it needs from the user (config + credentials)
* An `Integration` is an instance of a platform, which specifies its platform via a `PlatformEnum`
* An `Integration` is pretty much just a way to save settings and auth to the db
* A platform we wrote a module for (Fleet, ServiceNow) MAY sync several resource types from one `Integration` — one set of credentials, one row, independent cursors per resource
* The generic platforms (`ai`, `partner`) are **single-resource**: the resource is part of their config
* All `Platform` code lives together. A `Platform` follows a generic interface, and implements certain functions

## DB Models

What is an `External*Mapping`?

* "Our row mirrors a row that exists over there"
* Unique on `(integrationId, externalId)` — that constraint is the dedup key on every sync
* Also holds `upstreamApi` / `webUrl` for platforms too generic to derive them

What is a `SourceRecord`?

* A snapshot of some record at a point in time, that goes on to be a source for a notification or work order
* `SourceRecord`s are append-only, and deduplicate based on a `contentHash`. We order based on an `observedAt` field. This is cheap "version control".
* A `SourceRecord` may come from an integration (e.g. advisories come from teamplay Fleet). We populate `ExternalSourceRecordMapping` if so, and one mapping owns many snapshots.
* What a snapshot **is** and what it **fed** are different directions. `remediationId` is the former — a TA4 remediation POSTed to `/api/v1/remediations` writes its raw submission *and* points at the `Remediation` it created. What it fed goes through `SourceLink`.
* `SourceLink` is a join table because `sourceType` and `reasonWhy` describe *the decision to attach*, not the snapshot — `process-inbox-email.ts` sets them at classification time. One advisory can explain several CVEs, and under content-hash dedup you can't express that by duplicating the record.
* Examples:
  * A copy of an email (not version controlled)
  * What an advisory looked like when it was first published, hot off the press
  * What an advisory looked like 10 hours after it was published, now the text is all different

```prisma
enum SourceLinkType {
  Source // the target was created as a result of this record
  Link   // the target already existed and this record was attached to it
}

// replaces NotificationChannel. how a record entered the system;
// the platform behind `mappingId` says where it came from.
enum SourceChannel {
  Email       // inbound mail — mappingId null, externalId is the Resend id
  Integration // from a platform — mappingId set. absorbs PolledApi and Crawl
  TA4         // POSTed to /api/v1/remediations
}

model Integration {
  id       String       @id @default(cuid())
  name     String
  platform PlatformEnum // { AI, PARTNER, FLEET, SERVICE_NOW }

  config      Json   @default("{}") // validated by the platform's configSchema
  credentials Bytes? // AES-256-GCM, key from CREDENTIAL_ENCRYPTION_KEY
                     // decrypted plaintext is validated by the platform's credentialSchema

  syncEvery Int?    // seconds. null = inherit the platform's defaultSyncEvery.
                    // NOT "don't poll" — that's decided by changeSources.
  enabled   Boolean @default(true)

  // the user who created the integration
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // the shadow user this integration owns; ingested rows are attributed to it
  integrationUserId String @unique
  integrationUser   User   @relation(name: "integration_user", fields: [integrationUserId], references: [id], onDelete: Cascade)

  resourceSyncs IntegrationResourceSync[]

  // not pictured: back relations for `External*Mapping[]`, `ManagesRelationship[]`,
  //               and apiKeyConnector
  // not pictured: createdAt, updatedAt timestamps

  @@index([userId])
  @@index([integrationUserId])
  @@map("integration")
}

// replaces SyncStatus. one row per (integration, resource)
model IntegrationResourceSync {
  id            String       @id @default(cuid())
  integrationId String
  integration   Integration  @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  resource      ResourceType // Asset | WorkOrder | SourceRecord | Vulnerability | ...

  cursor              Json?          // for pagination — opaque to core, see "Cursors"
  status              SyncStatusEnum @default(Pending)
  errorMessage        String?
  lastAttemptAt       DateTime?
  lastSuccessfulSync  DateTime?
  consecutiveFailures Int            @default(0) // drives the backoff exponent; reset to 0 on success

  syncEvery Int?    // seconds. overrides Integration.
  enabled   Boolean @default(true) // operator toggle: turn off Fleet assets, keep work orders.
                                   // Distinct from pollability, which changeSources decides.
  nextSyncAt DateTime? // when this resource is next due. null = due now.
                       // Written at attempt *start* so a crashed worker can't wedge the
                       // row, and jittered so instances don't fall into lockstep:
                       //   now() + min(syncEvery * 2^consecutiveFailures, cap) * (0.9 + rand*0.2)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([integrationId, resource])
  @@index([integrationId])
  @@map("integration_resource_sync")
}

model SourceRecord {
  id      String        @id @default(cuid())
  channel SourceChannel // { Email, Integration, TA4 }

  // null for email / TA4 sources, since those aren't mirrored rows
  mappingId        String?
  mapping          ExternalSourceRecordMapping? @relation(name: "MappingSnapshots", fields: [mappingId], references: [id], onDelete: Cascade)
  // opposite side of ExternalSourceRecordMapping.latestSourceRecord.
  // Prisma bookkeeping — declares the second relation, generates no column.
  latestForMapping ExternalSourceRecordMapping? @relation(name: "LatestSourceRecord")

  contentHash String // dedup: skip the write if it matches the mapping's latest
  raw         Json    @default("{}")
  markdown    String? @db.Text
  // channel-scoped id for sources with no mapping (e.g. the Resend email id)
  externalId  String?
  observedAt  DateTime @default(now())

  // A SourceRecord can optionally be a TA4 remediation
  remediationId String?
  remediation   Remediation? @relation(fields: [remediationId], references: [id], onDelete: SetNull)

  links       SourceLink[] // what notifications / work orders this source feeds
  attachments NotificationAttachment[]

  @@unique([channel, externalId])
  @@index([mappingId, observedAt])
  @@index([remediationId])
  @@map("source_record")
}

model SourceLink {
  id             String       @id @default(cuid())
  sourceRecordId String
  sourceRecord   SourceRecord @relation(fields: [sourceRecordId], references: [id], onDelete: Cascade)

  // either a notification or a work order
  notificationId    String?
  notification      Notification?    @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  workOrderTicketId String?
  workOrderTicket   WorkOrderTicket? @relation(fields: [workOrderTicketId], references: [id], onDelete: Cascade)

  sourceType SourceLinkType @default(Source) // Source or Link
  reasonWhy  String?        @db.Text

  createdAt DateTime @default(now())

  @@unique([sourceRecordId, notificationId])
  @@unique([sourceRecordId, workOrderTicketId])
  @@index([notificationId])
  @@index([workOrderTicketId])
  @@map("source_link")
}

model ExternalSourceRecordMapping {
  id            String      @id @default(cuid())
  integrationId String
  integration   Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  externalId    String // the advisory / notification id on another platform

  sourceRecords        SourceRecord[] @relation(name: "MappingSnapshots")
  latestSourceRecordId String?        @unique
  latestSourceRecord   SourceRecord?  @relation(name: "LatestSourceRecord", fields: [latestSourceRecordId], references: [id], onDelete: SetNull)

  lastSynced DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([integrationId, externalId])
  @@index([integrationId])
  @@map("external_source_record_mappings")
}

model ExternalAssetMapping {
  // same fields as before
  // Both optional, both only set by ai/partner — code-defined platforms derive
  // these from their ResourceModule instead. Supplied per item in the upload envelope.
  upstreamApi String? // the API endpoint
  webUrl      String? // where a human looks at it
}
```

New tables for "who in the hospital, or outside of it, is responsible for managing this asset?"

```prisma
model ManagesRelationship {
  id               String @id @default(cuid())
  responsibilities String @db.Text

  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)

  // one vendor has many ManagesRelationships
  vendorId String?
  vendor   Vendor?   @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  contract Contract? // optional if a vendor is provided. fk lives on Contract

  // where work orders for these assets get filed
  workOrderIntegrationId String?
  workOrderIntegration   Integration? @relation(fields: [workOrderIntegrationId], references: [id], onDelete: SetNull)

  assets Asset[] @relation("ManagedAssets")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([departmentId])
  @@index([vendorId])
  @@index([workOrderIntegrationId])
  @@map("manages_relationship")
}

model Contract {
  // ... existing fields (vendor, coverageSummary, files)

  // one-to-one with ManagesRelationship
  managesRelationshipId String?              @unique
  managesRelationship   ManagesRelationship? @relation(fields: [managesRelationshipId], references: [id], onDelete: SetNull)

  // TODO: A Contract has a ContractSla in the future
}
```

This replaces today's *derived* answer to "who manages this asset?" — currently inferred from "has an `ExternalAssetMapping` to a Fleet integration" (`teamplay-fleet/tracking.ts`).

## Platforms as Code

### Core

* `types.ts` – types that define what a platform is
* `registry.ts` – exports the platforms, keyed by `PlatformEnum`
* `credentials.ts` – `encrypt` / `decrypt` against `CREDENTIAL_ENCRYPTION_KEY`
* `callback.ts` – mints the one-time upload token, response path, and resource JSON Schema for platforms that push data back to us (today's `getResponseConfig`)
* `urls.ts` – resolves a record's URLs. `api` = module's `apiUrlFor` ?? `mapping.upstreamApi`; `web` = module's `webUrlFor` ?? `mapping.webUrl` ?? the api URL. The two branches never collide: Fleet derives and stores nothing, a partner stores and derives nothing.
* `session/` – auth helpers
  * `http.ts` – fetch wrapper: base URL, timeout, JSON, retry
  * `basic.ts` – static header auth (basic / bearer / arbitrary header)
* `sync/` – shared sync helpers
  * `index.ts` – `resolveSyncStrategy(platform)`: the platform's own `sync`, else `pollSync`
  * `poll.ts` – `pollSync`: the default `listChanged` -> `toCanonical` -> ingest -> persist cursor loop
  * `ingest.ts` – dedup + upsert against `External*Mapping` (today's `processIntegrationSync`)

#### src/features/integrations/core/types.ts

```ts
export interface Session {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  dispose?(): Promise<void>;
}

export interface ConnectorModule<TConfig = unknown, TCreds = unknown> {
  definition: ConnectorDefinition<TConfig, TCreds>;
  createSession(input: { config: TConfig; creds: TCreds }): Promise<Session>;

  // How this platform syncs. Omitted -> core's pollSync drives the
  // ResourceModules below. ai/partner set this and have no ResourceModules.
  sync?: SyncStrategy<TConfig>;

  workOrders?:    ResourceModule<ViperWorkOrder, unknown, TConfig>;
  assets?:        ResourceModule<ViperAsset, unknown, TConfig>;
  notifications?: ResourceModule<ViperSourceRecord, unknown, TConfig>;
}

export interface ConnectorDefinition<TConfig, TCreds> {
  platform: PlatformEnum;                // no free-text slug to drift from the enum
  displayName: string;
  configSchema: z.ZodType<TConfig>;      // → validates instance.config
  credentialSchema: z.ZodType<TCreds>;   // → validates what goes to `credentials` bytes

  // poll    = the cron schedules it                          (fleet, ai, partner)
  // push    = data returns via our callback instead of us fetching it (ai, partner)
  // webhook = they notify us unprompted, nothing is scheduled
  // These are independent: ai/partner are ['poll', 'push'] — scheduled like any
  // poller, but the tick hands off rather than fetching. The cron filters on
  // 'poll'; 'push' is what makes the strategy return `pending: true`.
  changeSources: ReadonlyArray<'poll' | 'push' | 'webhook'>;

  // Connection-level rate limit floor. Enforced when the operator saves the
  // integration — before any resource is in scope, which is why it lives here
  // and defaultSyncEvery lives on the resource module.
  minSyncEvery?: number;
}

export interface ResourceModule<TCanonical, TRaw = unknown, TConfig = unknown> {
  // we pull from their platform
  listChanged(s: Session, cursor: Cursor | null): AsyncIterable<Page<TRaw>>;
  get(s: Session, externalId: string): Promise<TRaw>;
  toCanonical(raw: TRaw, config: TConfig): TCanonical;

  // we push to their platform
  create?(s: Session, c: CanonicalDraft<TCanonical>): Promise<PushResult<TRaw>>;
  update?(s: Session, externalId: string, patch: Patch<TCanonical>): Promise<PushResult<TRaw>>;

  // where is it on their platform?
  //  api: what's the api url?
  //  web: where does a human look to find this?
  apiUrlFor?(externalId: string, config: TConfig): string | null;
  webUrlFor?(externalId: string, config: TConfig): string | null;

  defaultSyncEvery: number | null; // this resource's natural cadence
}

// A strategy owns one (integration, resource) sync attempt end to end.
// It reports the cursor it reached; the worker persists it.
export type SyncStrategy<TConfig = unknown> =
  (ctx: SyncCtx<TConfig>) => Promise<{ cursor: Cursor | null; pending?: boolean }>;

export interface SyncCtx<TConfig = unknown, TCreds = unknown> {
  config: TConfig;
  creds: TCreds;  // ai forwards these to n8n — see the note below
  resource: ResourceType;
  session: Session;
  cursor: Cursor | null;
  lastSuccessfulSync: Date | null;          // partner's `since` when there's no cursor yet
  ingest(items: unknown[]): Promise<void>;  // core/sync/ingest.ts — closes over the row,
                                            // so attribution and mappings stay in core
  callback(): Promise<CallbackConfig>;      // core/callback.ts — token scoped to the shadow user
}

// Opaque to core: round-tripped through IntegrationResourceSync.cursor and
// interpreted only by the platform that produced it. See "Cursors".
export type Cursor = unknown;
```

Credentials reach exactly two places: `createSession` and `SyncCtx`. They must **not** reach `toCanonical`, `apiUrlFor`, `webUrlFor`, or `ingest` — a mapper that can read credentials is one refactor away from logging them, and mappers have no use for them.

`SyncCtx.creds` exists because the `ai` strategy forwards them to n8n, which crawls the upstream on our behalf and needs to authenticate as us. That is intended behavior and the n8n workflow depends on it, so the POST body to `N8N_AI_SYNC_URL` stays byte-compatible with what `syncAiIntegration` sends today.

#### Who speaks whose protocol

This is what decides whether a platform has `ResourceModule`s at all.

* **We speak theirs** (`fleet`, `service_now`). The upstream has its own shape, so the platform needs a `ResourceModule` per resource to `listChanged` / `get` / `toCanonical`.
* **They speak ours** (`ai`, `partner`). Items arrive already in VIPER's shape — that's what "follows the VIPER standard" means, and for `ai` it's why n8n is handed `z.toJSONSchema(integrationAssetInputSchema)`. There's nothing to translate, so **every `ResourceModule` field is omitted**: no `listChanged`, no `toCanonical`, no `apiUrlFor`. Their `sync` strategy hands off, the callback validates against the existing `integration*InputSchema`, and `core/sync/ingest.ts` does the upsert.

That's also why only three module fields exist. Vulnerabilities, remediations, and device artifacts arrive exclusively through `ai`/`partner` today, and those don't use `ResourceModule`s — so there's nothing to declare. The day a code-defined platform needs one, it's a one-line addition.

It's also why `upstreamApi` and `webUrl` survive on the mappings: a generic platform has no `webUrlFor` to call, so its URLs have to be stored.

Core resolves the resource list in one place. **There is no `resourcesFor` hook on the module** — the absence of `ResourceModule` fields is itself the signal that a platform is generic, and a generic platform's resource is in its config:

```ts
// core/sync/resources.ts
const genericConfig = z.object({ resource: z.nativeEnum(ResourceType) });

export const resourcesFor = (p: ConnectorModule, config: unknown): ResourceType[] => {
  const fromModules = [
    p.workOrders    && ResourceType.WorkOrder,
    p.assets        && ResourceType.Asset,
    p.notifications && ResourceType.SourceRecord,
  ].filter(Boolean);

  // No ResourceModules => generic platform => the resource is in config.
  return fromModules.length ? fromModules : [genericConfig.parse(config).resource];
};
```

`genericConfig.parse` makes "a generic platform declares `config.resource`" a validated contract rather than a silent convention — it fails loudly instead of returning `[]` and never syncing. Worth re-asserting at registry load so it's a startup error.

#### Cadence

Four levels, resolved in one function. The platform author knows the right cadence per resource; the operator overrides only when they have a reason.

```ts
resourceSync.syncEvery                  // per-resource override, usually null
  ?? integration.syncEvery              // instance-wide override
  ?? module.defaultSyncEvery            // platform knows assets are slow-moving
  ?? INTEGRATION_SYNC_EVERY_MIN * 60    // global floor
```

Clamped to `definition.minSyncEvery` at write time.

#### Cursors

A cursor answers exactly one question: *what do I ask for next time?* Core never reads it — it round-trips the JSON and the platform narrows it with its own Zod schema. Shapes, by upstream pagination style:

| Style | Cursor | Who |
|---|---|---|
| Watermark | `{ v: 1, since: '2026-08-10T04:00:00Z' }` | `partner` today (it's `lastSuccessfulSync`) |
| Watermark + tiebreak | `{ v: 1, updatedAt: '…', lastId: 'WO-1234' }` | anything with same-second write volume |
| Opaque token | `{ v: 1, pageToken: 'eyJvZmZzZXQiOjUwMH0' }` | most modern REST APIs |
| Offset | `{ v: 1, offset: 500 }` | Fleet `/activities` — `deriveOffsetFromUrl` already does this |

Three rules that matter more than the shape:

* **Carry a tiebreaker with any timestamp.** A bare `since` silently drops records when more share one timestamp than fit in a page and the boundary lands mid-group. `lastId` makes the boundary total.
* **Version it.** `v` lets a platform change cursor shape later; on mismatch, discard and full-resync rather than misread an old value.
* **Overlap on purpose.** Because `ingest` dedups on `(integrationId, externalId)`, replaying is idempotent — so a watermark should rewind a few minutes to absorb upstream clock skew and late writes. Re-fetching is cheap; a missed record is invisible forever.

The cursor is not `lastSuccessfulSync`: one is *where to resume*, the other is *when we last finished*, and only the second belongs in the UI. Push platforms return `pending: true` and leave the cursor untouched — the callback advances it.

### Platforms

#### src/features/integrations/platforms/teamplay-fleet/

* `index.ts` – assembles and exports modules
* `config.ts` – what the user has to provide. A zod schema. Any required constants.
  * configSchema, credentialSchema
* `session.ts` – how do we do auth?
  * createSession
* `urls.ts` – shared builders behind each module's `apiUrlFor` / `webUrlFor`
* `work-orders.ts` – ResourceModule
* `assets.ts` – ResourceModule
* `notifications.ts` – ResourceModule (advisories → SourceRecords)

`index.ts`

```ts
export const teamplayFleet: ConnectorModule<Config, Creds> = {
  definition: {
    platform: PlatformEnum.FLEET,
    displayName: 'teamplay Fleet',
    configSchema, credentialSchema,
    changeSources: ['poll'],
  },
  createSession,
  // no `sync` -- falls back to `pollSync`
  workOrders,
  assets,
  notifications,
};
```

`config.ts` – what the user has to provide (e.g. authentication, base URL…). A Zod schema. Also contains any required constants.

```ts
export const configSchema = z.object({
  siteAddress: fleetAddressSchema, // was FLEET_SITE_ADDRESS env var
  contactPhone: z.string(),        // was FLEET_CONTACT_PHONE env var
});
export const credentialSchema = z.object({ username: z.string(), password: z.string() });
export const BASE_URL = 'https://fleet.siemens-healthineers.com';
```

This retires `FLEET_ADVISORY_USERNAME` / `FLEET_ADVISORY_PASSWORD` — per-deployment config and creds move onto the row, so a second Fleet account stops being impossible.

`session.ts` – how does auth work?

```ts
// Fleet has no API auth — we drive the login form headlessly and reuse the cookie.
// Re-implement today's capture.ts here. The cookie is cached in-process with a
// TTL; there is no IntegrationSession table anymore.
export async function createSession({ config, creds }): Promise<Session> { /* … */ }
```

#### src/features/integrations/platforms/ai/

`config.ts`

```ts
export const configSchema = z.object({
  integrationUri: safeUrlSchema,
  resource: z.enum(ResourceType),                // single-resource
  additionalInstructions: z.string().optional(), // today's Integration.prompt
});
export const credentialSchema = authCredentialSchema; // basic | bearer | header | none
```

`sync.ts` – move `syncAiIntegration` from `src/inngest/functions/sync-integrations.ts` to here. VIPER doesn't fetch anything itself: it POSTs `integrationUri`, `additionalInstructions`, `ctx.creds`, and `ctx.callback()`'s path + JSON Schema to `N8N_AI_SYNC_URL`, then returns `{ pending: true }`. **Keep this body byte-compatible with today's** — the committed n8n workflow (`n8n_workflows/AI_Sync_Workflow.json`) reads these exact fields. `createSession` is a no-op passthrough and every `ResourceModule` field is omitted; `changeSources: ['poll', 'push']`.

#### src/features/integrations/platforms/partner/

`config.ts`

```ts
export const configSchema = z.object({
  integrationUri: safeUrlSchema,
  resource: z.enum(ResourceType), // single-resource
});
export const credentialSchema = authCredentialSchema; // basic | bearer | header | none
```

`sync.ts` – move `syncPartnerIntegration` here. POSTs `{ since: cursor ?? lastSuccessfulSync, page_size, callback }` and returns `{ pending: true }`; the partner pushes pages back to the callback. `changeSources: ['poll', 'push']`. The callback token has to become multi-use (or per-page) before `max_pages: 1` can be lifted.

Both `ai` and `partner` share `core/callback.ts` — that's the only thing their strategies have in common, and neither touches `core/sync/poll.ts`.

## Inngest

Still two functions, but the unit of work becomes `(integration, resource)` and **Inngest stops knowing anything platform-specific**. The `switch (integrationType)` in `sync-integrations.ts` goes away; so does `REST_MAPPERS`.

* **`syncAllIntegrations`** — cron `*/5`. Fan out one `integration/sync.requested { integrationId, resource }` per row where the integration is `enabled`, the platform's `changeSources` includes `'poll'`, the resource sync is `enabled`, and `nextSyncAt IS NULL OR nextSyncAt <= now()`. Three separate facts, three separate columns — no nulls doing double duty.
* **`syncIntegration`** — `concurrency: { key: 'event.data.integrationId + event.data.resource' }` so a manual *Sync Now* can't overlap the cron. Five steps, none platform-aware:
  1. load the integration, decrypt credentials, validate both against the platform's schemas
  2. advance `nextSyncAt` and stamp `lastAttemptAt` — **before** the work, so a crash costs one cycle instead of wedging the row
  3. `createSession`, then `resolveSyncStrategy(platform)` and run it
  4. persist the returned cursor + status (`pending: true` leaves it `Pending` for the callback to close out); on failure bump `consecutiveFailures`, on success reset it
  5. `dispose()` in a finally

Everything that differs between platforms — poll vs. hand-off-to-n8n vs. ask-the-partner-to-push — lives in the strategy, in the platform's own folder. Adding a platform means adding a directory; it never means editing an Inngest function.

A slow asset pull can no longer block work orders, and a failing resource fails only its own row.

Two bugs worth fixing while moving this code: `processIntegrationSync` `break`s out of the item loop on the first Prisma error, silently dropping the rest of the batch; and today's scheduler gates on the newest `SyncStatus` row regardless of state, so a stuck `Pending` suppresses re-sync forever.

## Changes from Current System

* Drop all `upstreamApi` fields, move those to `External*Mapping` fields
  * Made optional. Used on partner+AI integrations. Otherwise use the resource module's `apiUrlFor` / `webUrlFor`
  * Add a sibling `webUrl String?`, and accept an optional `webUrl` per item in the upload envelope (`createIntegrationInputSchema` in `src/lib/schemas.ts`) so partners can give us both. Optional, so existing partners are unaffected.
  * Every UI link that renders `upstreamApi` today resolves through `core/urls.ts` — note those links currently point at an API endpoint, which `webUrlFor` fixes
* Get rid of `IntegrationSession`, replace that with credentials stored encrypted in the `Integration` object
* Rename `NotificationSource` to `SourceRecord`, and change fields
  * Append-only, content-hashed; `referenceUrl` dropped (derive from the mapping instead)
  * `NotificationChannel` → `SourceChannel`, values `{ Email, Integration, TA4 }` — `PolledApi` and `Crawl` collapse into `Integration`, since a crawler is just a platform
  * Split the notification / work-order links into `SourceLink`, carrying `sourceType` + `reasonWhy`; `NotificationSourceType` → `SourceLinkType`
* Add `ExternalSourceRecordMapping` (one row per external record, many snapshots)
* Changes to `Integration` model
  * Drop `resourceType`, `integrationType`, `authType`, `authentication`, `integrationUri`, `prompt` (the last two move into per-platform `config`)
  * Add `PlatformEnum`, replacing free-text `platform` and the three places that identify a platform by substring-matching its hostname
  * Replace `SyncStatus` with `IntegrationResourceSync` — per-resource status, cursor, cadence, enable toggle, and schedule
* Move per-platform sync logic out of Inngest and into `platforms/*/sync.ts`; delete the `integrationType` switch and `REST_MAPPERS`
* Reorganize all of our integration code into modular pieces
* Add `ManagesRelationship`, changes to `Contract`

## Open Questions

* `Contract` → `ContractSla`
* Webhook-driven platforms (`changeSources: ['webhook']`) — the ingest path exists but nothing declares it yet
* Multi-page PARTNER pushes are blocked on the single-use callback token
* Should the inbox be a platform? Resend as an `Integration` with `changeSources: ['webhook']` would put email identity on a mapping like everything else, and `SourceRecord.externalId` could go away
