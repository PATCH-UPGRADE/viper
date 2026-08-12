# Integrations Refactor — Implementation Guide

Companion to [integrations-redesign.md](./integrations-redesign.md). That doc is the *design*; this one is the *how*, plus the context and decisions that live outside it.

**Read `integrations-redesign.md` first.** It has the schema and the interfaces. Don't re-derive them from here.

## Status

| Phase | State |
|---|---|
| 1 — Prisma models + migration + consumers | **Done.** Migration `20260811221210_integrations_redesign` is applied. |
| 2 — `src/features/integrations/core/` | Not started. |
| 3 — `platforms/ai/` and `platforms/partner/` | Not started. |

**The branch does not typecheck.** `npx tsc --noEmit` reports 56 errors, all in the UI layer, all deliberate — see [Deferred: the UI layer](#deferred-the-ui-layer). Server, schema, jobs, scripts and tests are clean. Don't treat those 56 as damage to repair on your way to Phase 2; they're tracked separately.

Trust nothing in this doc that you can check in under a minute. Every claim below has a command in [Verify](#verify) that confirms or refutes it.

## Scope

In scope, in this order:

1. `src/features/integrations/core/` — the platform interface and shared machinery
2. `src/features/integrations/platforms/ai/` and `.../partner/` conforming to it

**Out of scope. Do not start these:**

- The `teamplay-fleet` platform module. It's the hardest one (headless auth, three resource modules) and lands after `ai`/`partner` prove the interface. Leave `src/features/integrations/teamplay-fleet/` alone — with one exception noted under [Deferred](#deferred-the-ui-layer).
- The UI layer. Tracked as VW-499 / VW-449 / VW-431.
- Changing how `ai` sends credentials to n8n. It forwards them on purpose — see Ground rules. The POST body to `N8N_AI_SYNC_URL` must stay **byte-compatible** with what `syncAiIntegration` sends today; the committed workflow at `n8n_workflows/AI_Sync_Workflow.json` reads those exact fields.
- Inbox-as-a-platform (see Open Questions in the RFC).

## Ground rules

These were decided deliberately. If a change looks like an obvious improvement, it was probably considered — check here before "fixing" it.

| Decision | Why |
|---|---|
| `SourceRecord.raw` stays a Postgres `Json` column | S3 was proposed and rejected. Don't reintroduce it. |
| Six separate `External*Mapping` tables | Real FKs and cascade deletes beat one polymorphic table. |
| `ResourceModule`s are named fields (`workOrders`/`assets`/`notifications`), not a `ResourceType`-keyed map | Deliberate. Consequence: `core` needs a field→`ResourceType` mapping. It lives in **one** helper (`core/sync/resources.ts`) so adding a field means editing one function. |
| No `resourcesFor` hook on `ConnectorModule` | The absence of `ResourceModule` fields *is* the signal that a platform is generic; core then reads `config.resource`, validated by a shared zod schema. Don't add a per-module hook back — it would return a 1-element array for every implementor. |
| `ai` forwards credentials to n8n | **Intended, not a leak.** n8n crawls the upstream on our behalf and authenticates as us. `SyncCtx.creds` exists for this. |
| `ai`/`partner` are **single-resource** (`config.resource`) | One `Integration` = one resource for generic platforms. Only code-defined platforms are multi-resource. |
| No `InstanceCtx` type | Mappers and URL builders take `config: TConfig` and nothing else. Row-level facts (`integrationId`, shadow user) stay in `core/sync/ingest.ts`, which already loads the row. |
| Credentials appear **only** in `createSession` | Never pass them to `toCanonical`, `apiUrlFor`, or `ingest`. A mapper that can reach credentials is one refactor from logging them. |
| Credentials never reach the client | Every query returning an `Integration` row carries `omit: { credentials: true }`. Prisma returns all scalars by default and `include` only *adds* relations, so omitting is not automatic. |
| `credentials IS NULL` **is** `AuthType.None` | One representation, not two. `encodeAuthCredential` / `parseAuthCredential` in `config-schema.ts` are inverses across that boundary. Never store a blob that decrypts to `{authType:"None"}`. |
| `nextSyncAt` is written at attempt **start** | If written on completion, a crashed worker never advances it and the row wedges forever. |
| No latest-snapshot pointer on `ExternalSourceRecordMapping` | "Newest for this mapping" is `ORDER BY observedAt DESC LIMIT 1` against `@@index([mappingId, observedAt])`. A denormalized pointer is a second source of truth that goes stale. Don't add it back for symmetry with `ArtifactWrapper.latestArtifact`. |
| One meaning per column | `syncEvery` null = inherit. `nextSyncAt` null = due now. `enabled` = operator toggle. Pollability = `changeSources.includes('poll')`. Never overload these. |

## What Phase 1 landed

### Schema

The migration is **destructive by design**: it purges all `Integration`, `SourceRecord` and `notification_attachment` rows rather than backfilling them. Integration data is re-derivable by re-syncing; the shape change (plaintext auth → encrypted blob, scalar columns → per-platform `config` JSON) has no safe automatic translation.

It deletes `api_key_connector` rows with a non-null `integrationId` **before** deleting integrations, because that FK is `SET NULL` rather than cascade. It deliberately **does not** delete the shadow integration users: `Asset.userId`, `Vulnerability.userId` and `Remediation.userId` all cascade, so removing a shadow user would silently delete every record that integration ever ingested.

| Was | Is now |
|---|---|
| `Integration` (`platform String?`, `integrationType`, `resourceType`, `authType`, `authentication Json?`, `integrationUri`, `prompt`) | `Integration` (`platform PlatformEnum`, `config Json`, `credentials Bytes?`, `syncEvery Int?`, `enabled`) |
| `SyncStatus` (append-only log) | `IntegrationResourceSync` — one durable row per `(integration, resource)` with `cursor`, `syncEvery`, `enabled`, `nextSyncAt`, `consecutiveFailures`, `lastSuccessfulSync` |
| `IntegrationSession` | deleted |
| `NotificationSource` | `SourceRecord` (the snapshot) + `SourceLink` (the decision to attach it) |
| `NotificationChannel { Email, PolledApi, Crawl, TA4 }` | `SourceChannel { Email, Integration, TA4 }` |
| `NotificationSourceType` | `SourceLinkType` |
| `Asset.upstreamApi String` (required), nullable on `Vulnerability`/`Remediation`/`DeviceArtifact` | `External*Mapping.upstreamApi String?` + sibling `webUrl String?` |
| `ContractAsset` | `ManagesRelationship` — a contract reaches its assets through the relationship that answers "who is responsible for this asset?" |
| — | `PlatformEnum`, `ExternalSourceRecordMapping` |

`SourceRecord.contentHash` is `NOT NULL`, so every create site must supply one. Use `sourceContentHash(raw, markdown)` from `src/lib/source-hash.ts` — it canonicalizes key order, so a replayed payload with reshuffled keys still dedups.

`ExternalVulnerabilityMapping` maps to the legacy table name `external_item_mappings`. Renaming it is optional and a separate migration.

### Code

`sync-integrations.ts` now keys everything on `(integration, resource)`. `syncAllIntegrations` selects due rows via the `nextSyncAt` gate and fans out one event per resource; `syncIntegration` carries `resource` in its event data and has `concurrency: { key: integrationId + resource, limit: 1 }`. It claims the attempt — stamping `lastAttemptAt` and pushing `nextSyncAt` forward with jittered exponential backoff — *before* doing any work, so a crashed worker costs one cycle instead of wedging.

`router-utils.ts` has `upsertResourceSync` in place of `upsertSyncStatus`: one upsert against the durable row, no "find the newest Pending" dance and no 5-row prune. `processIntegrationToken` returns `resource` alongside `userId`/`integrationId`, and `processIntegrationSync` takes it as a sixth argument.

`parseAuthenticationJson` in `src/lib/utils.ts` is now structural — `{ authType, authentication? }` rather than `Integration | Webhook` — because `Integration` no longer has those columns. `Webhook` still satisfies the shape.

### The upload envelope

`createIntegrationInputSchema` in `src/lib/schemas.ts` adds optional per-item `upstreamApi` and `webUrl`. These belong to the **mapping**, not the record, and `processIntegrationSync` writes them onto the `External*Mapping` row on every create/update path.

**Gotcha that will bite you when you port `processIntegrationSync` into `core/sync/ingest.ts`:** every `transformInputItem` must destructure `upstreamApi` and `webUrl` out of the item before spreading the rest into `createData`. If they reach Prisma they're unknown columns, the write throws, and the current `break`-on-error behavior returns **HTTP 200 with `createdItemsCount: 0`** — a silent total failure. All five call sites do this today; keep the pattern.

This is also an **LLM-facing contract change**. `source.channel` on the work-order envelope no longer accepts `PolledApi` or `Crawl`, so a partner still sending those gets a 400. `AI_Sync_Workflow.json` needs no edit — it reads the schema dynamically.

### Test baseline

**467 passed / 467 total.** The eight `src/app/api/v1/__tests__/*` suites are supertest against a live server and need both a dev server and an API key:

```bash
npm run dev          # in another terminal
API_KEY="$(npm run db:create-test-api-key --silent | grep '^API_KEY=' | cut -d= -f2-)" npx vitest run
```

Without those they fail on `ECONNREFUSED :3000` or blanket 401s. That is an environment problem, not a regression — but it also means those suites hide real breakage, so run them properly before concluding anything is green.

## Phase 1 stand-ins — where they go in Phase 2

These exist because Phase 1 needed them before `core/` existed. Each has a destination; none is meant to stay where it is.

| File | Phase 2 destination |
|---|---|
| `src/lib/credentials.ts` | `core/credentials.ts`, **verbatim**. Deliberately generic AES-256-GCM with no `AuthType` knowledge, so the move is a rename. |
| `src/features/integrations/config-schema.ts` | Split into `platforms/ai/config.ts` and `platforms/partner/config.ts`, each owning its `configSchema` / `credentialSchema`. `encodeAuthCredential`/`parseAuthCredential` go wherever the shared credential shape lands. |
| `src/lib/upstream-urls.ts` | `core/urls.ts`. Today it only reads stored mapping URLs; `core/urls.ts` adds the `module.apiUrlFor` / `webUrlFor` precedence, which is what a code-defined platform needs. |
| `src/lib/source-hash.ts` | Fine where it is — `core/sync/ingest.ts` imports it. |
| `SyncCtx` interface in `sync-integrations.ts` | `core/types.ts`, as the RFC's `SyncCtx`. Already shaped close to it: credentials reach the strategy and nothing else. |
| `REST_MAPPERS` / `selectRestMapper` / `syncRestIntegration` | Deleted. The mapping moves into the Fleet module's `ResourceModule`s in a later phase. |
| `upsertResourceSync` + `processIntegrationSync` (`router-utils.ts`) | `core/sync/ingest.ts` |
| `getResponseConfig` (`sync-integrations.ts`) | `core/callback.ts` |

Search for `VW-427` — 11 markers name the specific thing each phase should collapse. The ones outside the deferred UI files are in `sync-integrations.ts` (the intentional n8n credential forward), `integrations/server/routers.ts` (the edit form can't prefill credentials), `inbox/types.ts` and `tracking/types.ts` (`referenceUrl` / `integrationUri` replaced by mapping URLs).

## Deferred: the UI layer

11 files still read fields the schema no longer has. This is intentional and ticketed; the components are being reworked rather than mechanically patched.

| Files | Reads | Ticket |
|---|---|---|
| `integrations/components/{columns,integrations,integrations-layout}.tsx` | `integrationType`, `resourceType`, `integrationUri`, `syncStatus` | VW-499 |
| `inbox/components/{columns,notification-detail,notification-details-tab}.tsx` | `notification.sources`, `receivedAt`, `referenceUrl` | VW-499 |
| `assets/components/{asset,assets,asset-drawer}.tsx`, `remediations/components/remediations.tsx` | `record.upstreamApi` | VW-449 |
| `integrations/integration-session-client.ts` | `prisma.integrationSession` | VW-431 |

That last one is **not** cosmetic. `IntegrationSession` is gone, so Fleet's cookie re-auth is a runtime failure, not just a type error. The replacement is an in-process TTL cache keyed by host (the table was `host @unique` globally, which made two accounts on one platform impossible). The Fleet phase owns this; the RFC specifies the cache in Fleet's future `session.ts`. Note the cache is per-process, so the Next server and the Inngest worker each do their own headless re-login on first 401 instead of sharing one cookie.

## Phase 2 — `core/`

```
src/features/integrations/core/
  types.ts        # verbatim from the RFC
  registry.ts     # PlatformEnum -> ConnectorModule
  credentials.ts  # move src/lib/credentials.ts here
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
- `ingest.ts`: **fix the bug while porting.** `processIntegrationSync` `break`s out of the item loop on the first Prisma error, silently dropping the rest of the batch and reporting partial success. Collect errors and continue. See the envelope gotcha above for how loudly this fails today.
- `callback.ts` is the only thing `ai` and `partner` share. Neither touches `poll.ts`.

## Phase 3 — `ai` and `partner`

```
src/features/integrations/platforms/{ai,partner}/
  index.ts config.ts sync.ts
```

Both: `createSession` is a no-op passthrough, **no `ResourceModule` fields at all**, `config.resource` names the single resource, and `changeSources: ['poll', 'push']`.

That pair is not a contradiction. `'poll'` is what makes the cron schedule them — they run on `syncEvery` like any poller. `'push'` describes what happens when the tick fires: the strategy hands off and returns `{ pending: true }` instead of fetching. Drop `'poll'` and they'd never be scheduled at all.

Move `syncAiIntegration` and `syncPartnerIntegration` out of `sync-integrations.ts` into each platform's `sync.ts`, reshaped as a `SyncStrategy`. Both return `{ pending: true }` — the work finishes when the callback lands, so the row must stay `Pending`. `upsertResourceSync` already implements that half: only a *failed* hand-off is terminal, because no callback will ever fire for one.

Then `sync-integrations.ts` keeps only the two Inngest functions with no platform knowledge: delete the `platform` switch, `REST_MAPPERS`, `selectRestMapper`, and `syncRestIntegration`.

### One known limit — preserve, don't fix

`partner` hard-codes `max_pages: 1`. The callback token is single-use, so page 2 would 401. Lifting this needs a multi-use or per-page token; out of scope.

## Verify

Confirm the starting state before you build on it. Expected results are stated so you can tell "already done" from "done differently".

```bash
npx prisma validate                                    # -> schema is valid
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma --exit-code   # -> exit 0, "No difference detected"
npx biome check .                                      # -> exit 0
npx tsc --noEmit 2>&1 | grep -c "error TS"             # -> 56, all in the UI files listed above
```

If `tsc` reports errors **outside** those 11 files, something regressed — that's yours to fix. If it reports fewer than 56, someone has started the UI tickets; reconcile before assuming.

Storage-shape checks against a seeded DB:

```sql
SELECT name, platform, credentials IS NULL AS no_auth FROM integration;
SELECT resource, status, "nextSyncAt", "consecutiveFailures" FROM integration_resource_sync;
```

`npm run db:seed` then `npm run db:create-blueflow-integration` should leave two integrations, both `no_auth = t` (neither uses auth), and one `IntegrationResourceSync` row each with `nextSyncAt` null — meaning due on the next cron tick.

End-to-end:

- Partner: `docs/blueflow-integration-testing.md`. `scripts/create-blueflow-integration.ts` is already on the new schema.
- Run `npm run dev:all`, trigger a sync from the integrations page, and confirm one `IntegrationResourceSync` row advances `nextSyncAt` at attempt start and stays `Pending` until the callback lands.

`CREDENTIAL_ENCRYPTION_KEY` (32 bytes, base64) is required wherever an integration with auth is written — it's in `.env.example` and in the `run-npm-tests` job in `ci.yml`. It is deliberately **not** in `.env.ci`: the Blueflow container has no authenticated integration, so nothing there encrypts or decrypts.

## If something's ambiguous

The RFC's "Open Questions" section lists what's genuinely undecided. Anything not there was decided — check the Ground rules table above, and ask rather than choosing for yourself.
