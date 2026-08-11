# Integrations Refactor — Implementation Guide

Companion to [integrations-redesign.md](./integrations-redesign.md). That doc is the *design*; this one is the *how*, plus the context and decisions that live outside it.

**Read `integrations-redesign.md` first.** It has the schema and the interfaces. Don't re-derive them from here.

## Scope

In scope, in this order:

1. New/changed Prisma models + migrations
2. `src/features/integrations/core/` — the platform interface and shared machinery
3. `src/features/integrations/platforms/ai/` and `.../partner/` conforming to it

**Out of scope.** Do not start these:

- The `teamplay-fleet` platform module. It's the hardest one (headless auth, three resource modules) and lands after `ai`/`partner` prove the interface. Leave `src/features/integrations/teamplay-fleet/` alone.
- UI changes beyond what's needed to typecheck.
- Changing how `ai` sends credentials to n8n. It forwards them on purpose — see Ground rules. The POST body to `N8N_AI_SYNC_URL` must stay **byte-compatible** with what `syncAiIntegration` sends today; the committed workflow at `n8n_workflows/AI_Sync_Workflow.json` reads those exact fields.
- Inbox-as-a-platform (see Open Questions in the RFC).

## Ground rules

These were decided deliberately. If a change looks like an obvious improvement, it was probably considered — check here before "fixing" it.

| Decision | Why |
|---|---|
| `SourceRecord.raw` stays a Postgres `Json` column | S3 was proposed and rejected. Don't reintroduce it. |
| Six separate `External*Mapping` tables | Real FKs and cascade deletes beat one polymorphic table. Additive migration. |
| `ResourceModule`s are named fields (`workOrders`/`assets`/`notifications`), not a `ResourceType`-keyed map | Deliberate. Consequence: `core` needs a field→`ResourceType` mapping. It lives in **one** helper (`core/sync/resources.ts`) so adding a field means editing one function. |
| No `resourcesFor` hook on `ConnectorModule` | The absence of `ResourceModule` fields *is* the signal that a platform is generic; core then reads `config.resource`, validated by a shared zod schema. Don't add a per-module hook back — it would return a 1-element array for every implementor. |
| `ai` forwards credentials to n8n | **Intended, not a leak.** n8n crawls the upstream on our behalf and authenticates as us. `SyncCtx.creds` exists for this. |
| `ai`/`partner` are **single-resource** (`config.resource`) | One `Integration` = one resource for generic platforms. Only code-defined platforms are multi-resource. |
| No `InstanceCtx` type | Mappers and URL builders take `config: TConfig` and nothing else. Row-level facts (`integrationId`, shadow user) stay in `core/sync/ingest.ts`, which already loads the row. |
| Credentials appear **only** in `createSession` | Never pass them to `toCanonical`, `apiUrlFor`, or `ingest`. A mapper that can reach credentials is one refactor from logging them. |
| `nextSyncAt` is written at attempt **start** | If written on completion, a crashed worker never advances it and the row wedges forever — the bug that exists today. |
| `SourceRecord.referenceUrl` is dropped | Derive from the mapping + `webUrlFor` instead. |
| One meaning per column | `syncEvery` null = inherit. `nextSyncAt` null = due now. `enabled` = operator toggle. Pollability = `changeSources.includes('poll')`. Never overload these. |

## Current state — what exists today

### Prisma (`prisma/schema.prisma`)

| Today | Becomes |
|---|---|
| `Integration` (`platform String?`, `integrationType`, `resourceType`, `authType`, `authentication Json?`, `integrationUri`, `prompt`) | `Integration` with `platform PlatformEnum`, `config Json`, `credentials Bytes?` |
| `SyncStatus` | `IntegrationResourceSync` (adds cursor, cadence, `enabled`, `nextSyncAt`, `consecutiveFailures`) |
| `IntegrationSession` (keyed `host @unique` — globally, so two accounts on one platform are impossible; `expiresAt` written but never read) | deleted |
| `NotificationSource` | `SourceRecord` + `SourceLink` |
| `NotificationChannel { Email, PolledApi, Crawl, TA4 }` | `SourceChannel { Email, Integration, TA4 }` |
| `NotificationSourceType` | `SourceLinkType` |
| `Asset.upstreamApi String` (**required**), same field nullable on `Vulnerability` / `Remediation` / `DeviceArtifact` | `External*Mapping.upstreamApi String?` + new sibling `webUrl String?` |
| — | `PlatformEnum`, `ManagesRelationship`, `ExternalSourceRecordMapping` |

`ExternalVulnerabilityMapping` maps to the legacy table name `external_item_mappings`. Renaming it is optional; if you do, it's a separate migration.

### Code

| Path | Role today |
|---|---|
| `src/inngest/functions/sync-integrations.ts` | Everything. `syncAllIntegrations` (cron), `syncIntegration` (the `integrationType` switch), `syncAiIntegration`, `syncPartnerIntegration`, `syncRestIntegration`, `REST_MAPPERS` + `selectRestMapper`, `getResponseConfig` |
| `src/lib/router-utils.ts` | `processIntegrationSync` (dedup/upsert engine), `processIntegrationToken`, `upsertSyncStatus` |
| `src/lib/utils.ts` | `parseAuthenticationJson` — builds auth headers from the plaintext JSON |
| `src/lib/schemas.ts` | `authSchema`, `createIntegrationInputSchema` (the upload envelope — add an optional per-item `webUrl` alongside `upstreamApi`) |
| `src/lib/tokens.ts` | `createUserToken` / `consumeUserToken` — single-use, SHA-256 hashed, 15 min TTL. The one secret handled well today. |
| `src/features/integrations/integration-session-client.ts` | `IntegrationSessionClient` — cookie session + re-auth on 401/403 |
| `src/features/integrations/server/routers.ts` | tRPC CRUD + `triggerSync` |
| `src/features/integrations/types.ts` | input zod schema, `integrationsMapping` (URL slug → `ResourceType`) |
| `src/app/api/inngest/route.ts` | registers `syncAllIntegrations`, `syncIntegration` |

**Upload endpoints** (`trpc-to-openapi`, path `/{resource}/integrationUpload/{token}`) — these stay; `core/callback.ts` targets them:
`assets`, `vulnerabilities`, `remediations`, `deviceArtifacts` (`src/features/*/server/routers.ts`) and `workOrders` (`src/features/tracking/server/routers.ts`).

**Env vars.** `N8N_AI_SYNC_URL`, `N8N_KEY` (ai). Add `CREDENTIAL_ENCRYPTION_KEY` (32 bytes, base64) to `.env.example`. Note `FLEET_ADVISORY_USERNAME` / `FLEET_ADVISORY_PASSWORD` are read at runtime but missing from `.env.example` — pre-existing, Fleet-phase problem.

## Phase 1 — DB models

Write the schema, then the migration, then a backfill script. There is live data; none of this is a clean create.

### Prisma gotchas hit while designing this

- **`SourceRecord` ↔ `ExternalSourceRecordMapping` needs two *named* relations.** The snapshot list and the `latestSourceRecordId` pointer are separate relations (`"MappingSnapshots"` / `"LatestSourceRecord"`) or Prisma reads them as one ambiguous pair. `latestForMapping` is a back-reference that generates **no column** — it's required bookkeeping, not a field. Same idiom as `Artifact.latestForWrapper` ↔ `ArtifactWrapper.latestArtifact`, already in the schema.
- **`Contract.managesRelationshipId` must be `@unique`** or Prisma makes it many-to-one instead of 1:1.
- **`Integration` → `User` twice** (creator + shadow user); the second keeps `name: "integration_user"`.
- **`assets Asset[] @relation("ManagedAssets")`** needs `managedBy ManagesRelationship[] @relation("ManagedAssets")` added to `Asset`.
- Prisma client output is `src/generated/prisma`, not `node_modules`. Run `npx prisma generate` after schema edits.

### Backfill

| From | To | Notes |
|---|---|---|
| `Integration.authentication` (plaintext JSON) | `credentials` (AES-256-GCM) | Encrypt in place with a script. Read shape via `authSchema`. |
| `Integration.integrationUri` / `prompt` / `authType` | `config` JSON | Shape depends on `platform`; write per-platform. |
| `Integration.resourceType` | one `IntegrationResourceSync` row | Also seed `config.resource` for ai/partner. |
| `SyncStatus` | `IntegrationResourceSync.status` / `errorMessage` | Keep only the newest per integration. |
| `Asset.upstreamApi` (required) | `ExternalAssetMapping.upstreamApi` | Only where a mapping exists. Manually-created assets have a human-typed URL and simply lose it — intended. `webUrl` starts null everywhere. |
| `NotificationSource.raw` | `SourceRecord.contentHash` | Hash existing `raw` to seed the column. |
| `NotificationSource.channel` `PolledApi`/`Crawl` | `Integration` | `Crawl` is currently never written. |
| `NotificationSource.notificationId` / `workOrderTicketId` + `sourceType` + `reasonWhy` | one `SourceLink` row each | This is the join-table split. |

Only `Email` and `PolledApi` are ever written as channel values today — `Crawl` and `TA4` are declared but unused. `SourceRecord.referenceUrl`'s predecessor is likewise never populated, so dropping it moves no data.

## Phase 2 — `core/`

```
src/features/integrations/core/
  types.ts        # verbatim from the RFC
  registry.ts     # PlatformEnum -> ConnectorModule
  credentials.ts  # encrypt/decrypt against CREDENTIAL_ENCRYPTION_KEY
  callback.ts     # port getResponseConfig out of sync-integrations.ts
  urls.ts         # module.apiUrlFor/webUrlFor, else mapping.upstreamApi/webUrl
  session/{http,basic}.ts
  sync/
    index.ts      # resolveSyncStrategy
    resources.ts  # resourcesFor — module fields, else config.resource
    poll.ts       # pollSync — unused until Fleet, but the interface needs it
    ingest.ts     # port processIntegrationSync out of router-utils.ts
```

- `registry.ts` should assert at load that every module either has a `ResourceModule` field or a config that parses as generic (`{ resource }`). Otherwise a misconfigured platform silently never syncs.
- `ingest.ts`: **fix the bug while porting.** `processIntegrationSync` currently `break`s out of the item loop on the first Prisma error, silently dropping the rest of the batch and reporting partial success as one `Error`. Collect errors and continue.
- `callback.ts` is the only thing `ai` and `partner` share. Neither touches `poll.ts`.

## Phase 3 — `ai` and `partner`

```
src/features/integrations/platforms/{ai,partner}/
  index.ts config.ts sync.ts
```

Both: `createSession` is a no-op passthrough, **no `ResourceModule` fields at all**, `config.resource` names the single resource, and `changeSources: ['poll', 'push']`.

That pair is not a contradiction. `'poll'` is what makes the cron schedule them — they run on `syncEvery` like any poller. `'push'` describes what happens when the tick fires: the strategy hands off and returns `{ pending: true }` instead of fetching. Drop `'poll'` and they'd never be scheduled at all.

Move `syncAiIntegration` and `syncPartnerIntegration` out of `sync-integrations.ts` into each platform's `sync.ts`, reshaped as a `SyncStrategy`. Both return `{ pending: true }` — the work finishes when the callback lands, so the row must stay `Pending`, not flip to `Success`.

Then `sync-integrations.ts` keeps only the two Inngest functions, with no platform knowledge: delete the `integrationType` switch, `REST_MAPPERS`, `selectRestMapper`, and `syncRestIntegration`.

### Two known limits — preserve, don't fix

- `partner` hard-codes `max_pages: 1`. The callback token is single-use, so page 2 would 401. Lifting this needs a multi-use or per-page token; out of scope.
- `syncAllIntegrations` today gates on the newest `SyncStatus` row *regardless of state*, so a stuck `Pending` suppresses re-sync forever. The new `nextSyncAt` gate fixes this — make sure you don't reimplement the old predicate alongside it.

Also add `concurrency: { key: integrationId + resource }` to `syncIntegration`; today there's none, so a manual *Sync Now* and the cron can run the same integration twice at once.

## Verify

```bash
npx prisma validate && npx prisma generate && npm run lint
```

The design's schema was validated against a stubbed `prisma validate` run, so it compiles — but the *migration* is yours to prove.

- Existing tests that touch this code: `src/app/api/v1/__tests__/remediations.test.ts`, and `teamplay-fleet/{activities,tracking}.test.ts` (should be untouched — if they break, you went out of scope).
- Partner end-to-end: `docs/blueflow-integration-testing.md`. `scripts/create-blueflow-integration.ts` creates an `Integration` with the old fields and **will need updating**.
- Run `npm run dev:all` and trigger a sync from the integrations page; confirm one `IntegrationResourceSync` row advances `nextSyncAt` at attempt start and stays `Pending` until the callback lands.

## If something's ambiguous

The RFC's "Open Questions" section lists what's genuinely undecided. Anything not there was decided — check the Ground rules table above, and ask rather than choosing for yourself.
