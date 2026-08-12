# Integrations Refactor — Implementation Guide

Companion to [integrations-redesign.md](./integrations-redesign.md). That doc is the *design*; this one is the *how*, plus the context and decisions that live outside it.

**Read `integrations-redesign.md` first.** It has the schema and the interfaces. Don't re-derive them from here.

## Status

| Phase | State |
|---|---|
| 1 — Prisma models + migration + consumers | **Done.** Migration `20260811221210_integrations_redesign` is applied. |
| 2 — `src/features/integrations/core/` | **Done.** |
| 3 — `platforms/ai/` and `platforms/partner/` | **Done.** Inngest no longer knows any platform. |
| 4 — trim the unused abstractions | **Done.** `Session`, `poll.ts` and `changeSources` deleted; `resource` made structural; `ingest` renamed `upsert`; the tRPC input takes `config`/`credentials` directly. |
| next — `platforms/teamplay-fleet/` | Not started. `FLEET` is unregistered, so a Fleet sync errors with a message saying so. See [FLEET is dark on purpose](#fleet-is-dark-on-purpose). |

**The branch does not typecheck**, on purpose. `npx tsc --noEmit` reports errors in the UI layer only — see [Deferred: the UI layer](#deferred-the-ui-layer). Server, schema, jobs, scripts and tests are clean. Don't treat those as damage to repair; they're tracked separately. What matters when you change something is the *set of files* in the error list, not the count: record it before you start, and no new file may appear in it.

Phases 2 and 3 added the first tests this machinery has ever had, under `core/**/__tests__/`,
`platforms/*/__tests__/` and `src/inngest/functions/__tests__/`. Two are byte-compat guards on
outbound request bodies (the n8n hand-off and the partner registration); if you change either body,
you are changing a contract with something outside this repo.

Phase 4 removed some of them on purpose, along with the code they covered — the session stub, the
`dispose` path, the cron's platform filter, and the three that only exercised the old
multi-clause failure summary. A lower count is the expected outcome, not a regression.

Trust nothing in this doc that you can check in under a minute. Every claim below has a command in [Verify](#verify) that confirms or refutes it.

## Scope

Landed:

1. `src/features/integrations/core/` — the platform interface and shared machinery
2. `src/features/integrations/platforms/ai/` and `.../partner/` conforming to it

**Still out of scope. Do not start these:**

- The `teamplay-fleet` platform module. It's the hardest one (headless auth, three resource modules) and lands now that `ai`/`partner` have proved the interface. `src/features/integrations/teamplay-fleet/` is untouched — `activities.ts` has no production caller at the moment, but its mappers are what the Fleet module's `ResourceModule`s will be built from, and `activities.test.ts` still covers them.
- The UI layer. Tracked as VW-499 / VW-449 / VW-431.
- Changing how `ai` sends credentials to n8n. It forwards them on purpose — see Ground rules. The POST body to `N8N_AI_SYNC_URL` is **byte-compatible** with what `syncAiIntegration` sent, and `platforms/ai/__tests__/sync.test.ts` snapshots it; the committed workflow at `n8n_workflows/AI_Sync_Workflow.json` reads those exact fields.
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
| No `InstanceCtx` type | Mappers and URL builders take `config: TConfig` and nothing else. Row-level facts (`integrationId`, shadow user) stay in `core/sync/upsert.ts`, which already loads the row. |
| Credentials appear **only** in `SyncCtx.creds` | Never pass them to `toCanonical`, `apiUrlFor`, or the upsert path. A mapper that can reach credentials is one refactor from logging them. |
| Credentials never reach the client | Every query returning an `Integration` row carries `omit: { credentials: true }`. Prisma returns all scalars by default and `include` only *adds* relations, so omitting is not automatic. |
| `credentials IS NULL` **is** `AuthType.None` | One representation, not two. `encodeAuthCredential` / `parseAuthCredential` in `core/credentials.ts` are inverses across that boundary. Never store a blob that decrypts to `{authType:"None"}`. |
| `nextSyncAt` is written at attempt **start** | If written on completion, a crashed worker never advances it and the row wedges forever. |
| No latest-snapshot pointer on `ExternalSourceRecordMapping` | "Newest for this mapping" is `ORDER BY observedAt DESC LIMIT 1` against `@@index([mappingId, observedAt])`. A denormalized pointer is a second source of truth that goes stale. Don't add it back for symmetry with `ArtifactWrapper.latestArtifact`. |
| One meaning per column | `syncEvery` null = inherit. `nextSyncAt` null = due now. `enabled` = operator toggle. Never overload these. Whether a platform pulls or hands off is not a column or a declaration — it's whether its strategy returns `pending: true`. |

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

**Gotcha that will bite you when you port `processIntegrationSync` into `core/sync/upsert.ts`:** every `transformInputItem` must destructure `upstreamApi` and `webUrl` out of the item before spreading the rest into `createData`. If they reach Prisma they're unknown columns, the write throws, and the current `break`-on-error behavior returns **HTTP 200 with `createdItemsCount: 0`** — a silent total failure. All five call sites do this today; keep the pattern.

This is also an **LLM-facing contract change**. `source.channel` on the work-order envelope no longer accepts `PolledApi` or `Crawl`, so a partner still sending those gets a 400. `AI_Sync_Workflow.json` needs no edit — it reads the schema dynamically.

### Test baseline

The eight `src/app/api/v1/__tests__/*` suites are supertest against a live server and need both a dev server and an API key — note `npm run test` is bare `vitest`, i.e. watch mode:

```bash
npm run dev          # in another terminal
API_KEY="$(npm run db:create-test-api-key --silent | grep '^API_KEY=' | cut -d= -f2-)" npx vitest run
```

Without those they fail on `ECONNREFUSED :3000` or blanket 401s. That is an environment problem, not a regression — but it also means those suites hide real breakage, so run them properly before concluding anything is green.

## Phase 1 stand-ins — where they went

These existed because Phase 1 needed them before `core/` did. All are now moved; the originals are deleted.

| Was | Is now |
|---|---|
| `src/lib/credentials.ts` | `core/credentials.ts`, verbatim, plus the shared `AuthCredential` shape and its `encode`/`parse` pair. |
| `src/features/integrations/config-schema.ts` | Split into `platforms/ai/config.ts` and `platforms/partner/config.ts`, each owning its `configSchema` / `credentialSchema`. The credential half went to `core/credentials.ts`. |
| `src/lib/upstream-urls.ts` | `core/urls.ts`, which adds the `apiUrlFor` / `webUrlFor` precedence. `UrlBuilders` is a **parameter, not a registry lookup** — a lookup would drag `core/callback -> @/lib/tokens -> @/lib/db` into every client component that renders a link. |
| `src/lib/source-hash.ts` | Unmoved. Still imported by the work-order upload path. |
| `SyncCtx` in `sync-integrations.ts` | `core/types.ts`. Row-level facts (`integrationId`, the shadow user) dropped out of it — they're captured by the `ingest` / `callback` closures core builds. |
| `REST_MAPPERS` / `selectRestMapper` / `syncRestIntegration` | Deleted. `mapFleetActivities` / `deriveOffsetFromUrl` survive untouched in `teamplay-fleet/activities.ts`, waiting for the Fleet module's `ResourceModule`s. |
| `upsertResourceSync` + `processIntegrationSync` (`router-utils.ts`) | `core/sync/upsert.ts` — named for what it does, and so nobody reads "ingest" as "Inngest". `processIntegrationToken` and `createArtifactWrappers` stayed behind, so the five upload procedures import from both. |
| `getResponseConfig` (`sync-integrations.ts`) | `core/callback.ts`, as `createCallback`. Same paths, same schemas, same single-use 15-minute token. |

### FLEET is dark on purpose

`registry` holds only `AI` and `PARTNER`. A `FLEET` row still gets scheduled by the cron — `isPollable` answers `true` for an unregistered platform deliberately — so the failure surfaces where an operator looks, on the resource row:

> No platform module is registered for FLEET. Registered: AI, PARTNER. The teamplay Fleet module lands in a later phase; until then a FLEET integration cannot be created or synced.

Filtering it out of the fan-out instead would leave the row `Pending` forever with nothing to see. Backoff spaces the retries out on its own (24h cap after six failures). `integrations.create`/`update` reject `FLEET` with a 400 carrying the same message. The seeded Fleet integration in `prisma/seed.ts` is left enabled for exactly this reason.

### Two behaviour changes worth knowing

**Partial ingest failures are now loud and partial.** `processIntegrationSync` used to `break` on the first Prisma error, dropping the rest of the batch and returning HTTP 200 with `createdItemsCount: 0`. It now collects errors and continues. The status is still 200 and `shouldRetry` still drives `Error` on the sync row, but the counts are real and `message` becomes `"<N> of <TOTAL> items failed: <e1>; <e2>; <e3> (+K more)"` (distinct messages only, capped at 1000 chars).

**Decrypted credentials no longer cross a step boundary.** `step.run` return values are shipped to and memoized by the Inngest service, and the old `fetch-integration` step returned `creds`. The load step now runs `omit: { credentials: true }`, and the strategy step re-reads and decrypts in-process. That also forced the shape of the function: a closure or a module can't cross a boundary either, so resolving the platform, building the ctx and running the strategy all live in **one** step — four steps, not the RFC's five.

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

## What `core/` is

```
src/features/integrations/core/
  types.ts        # what a Platform is. NOT server-only — urls.ts reaches clients through it
  registry.ts     # PlatformEnum -> ConnectorModule, + load-time assertions
  credentials.ts  # AES-256-GCM, and the shared AuthCredential shape
  callback.ts     # createCallback: one-time token, response path, resource JSON Schema
  urls.ts         # apiUrlFor/webUrlFor, else mapping.upstreamApi/webUrl

  sync/
    cadence.ts    # effectiveSyncEvery + computeNextSyncAt
    resources.ts  # resourcesFor — module fields, else config.resource
    upsert.ts     # processIntegrationSync + upsertResourceSync
```

There is **no `Session`** and no `session/` directory. The only thing platforms share about authentication is `authHeaders(creds)` in `credentials.ts`: `partner` authenticates to the partner with the integration's own credentials, `ai` authenticates to n8n with a VIPER-global `N8N_KEY`, and Fleet will authenticate with a headless-login cookie it caches itself. A `Session` object fit none of the three, which is why `createBasicSession` shipped with zero callers.

There is **no `poll.ts`** either. The pull loop it sketched couldn't run — it called an ingest closure that threw — so it wasn't an extension point, it was a placeholder. Writing it for real means first lifting the five `SyncConfig` literals out of the resource routers so core can dispatch by `ResourceType`, and that is the same piece of work as the first pulling platform. `ConnectorModule.sync` is therefore required, and every platform owns its attempt end to end.

`registry.ts` asserts one thing at load: that a module's registry key matches its `definition.platform`. Everything else that used to be checked there is structural now — `sync` is required, and a generic platform gets `resource` by composing `genericConfigSchema`.

## What `ai` and `partner` are

```
src/features/integrations/platforms/{ai,partner}/
  index.ts config.ts sync.ts
```

Both: **no `ResourceModule` fields at all**, `config.resource` names the single resource, and the strategy hands off and returns `{ pending: true }` instead of fetching.

They are still scheduled like any other platform — the cron fans out every enabled, due resource row, and `syncEvery` applies to them the same way. What "hand-off" changes is only what happens when the tick fires. `upsertResourceSync` implements the other half: a successful hand-off leaves the row `Pending` for the callback to close out, and only a *failed* hand-off is terminal, because no callback will ever fire for one.

`callback.ts` is the only thing the two share. Note they don't even authenticate to the same party: `partner` signs its registration POST with the integration's credentials via `authHeaders`, while `ai` authenticates to n8n with `N8N_KEY` and forwards the integration's credentials as payload. `partner/sync.ts` uses plain `fetch` because it has exactly one absolute URL to POST — the `integrationUri` from its config, path and all.

`sync-integrations.ts` now holds two Inngest functions and no platform knowledge at all.

### One known limit — preserve, don't fix

`partner` hard-codes `max_pages: 1`. The callback token is single-use, so page 2 would 401. Lifting this needs a multi-use or per-page token; out of scope.

## Verify

Expected results are stated so you can tell "already done" from "done differently".

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

End-to-end, driving the **real** partner strategy:

The suite in `docs/blueflow-integration-testing.md` mints a token and registers Blueflow's webhook *itself*, so it never runs `platforms/partner/sync.ts`. To exercise the actual path, run Blueflow alone and VIPER on the host:

```bash
docker compose -f docker/dev/compose.blueflow-only.yml up -d
```

That file differs from the CI stack in exactly two places, both because VIPER is not in the network: `VIPER_CALLBACK_ALLOWED_HOSTS=host.docker.internal` (CI pins it to the `viper` service name) and `BASE_URL` on localhost. Then:

1. Seed Blueflow with its own fixture — fetch `data/assets.json` from their `develop` branch and feed it to `manage.py create_assets` (see the local-run block in `blueflow-integration-testing.md`).
2. Run VIPER with `NEXT_PUBLIC_APP_URL=http://host.docker.internal:3000` plus `npm run inngest:dev`, so the callback URL `createCallback` mints is reachable from inside the container.
3. Create the integration through the API — no UI needed:

```bash
curl -s -X POST 'http://localhost:3000/api/trpc/integrations.create?batch=1' -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' -d '{"0":{"json":{"name":"Local Blueflow","platform":"PARTNER","syncEvery":300,"config":{"integrationUri":"http://localhost:8000/api/viper/webhook/","resource":"Asset"}}}}'
```

4. Fire `integrations.triggerSync` with that id and watch the row: `lastAttemptAt` and a jittered `nextSyncAt` are stamped at attempt *start*, the status holds `Pending` through the hand-off, and the callback flips it to `Success` with `lastSuccessfulSync` set and `consecutiveFailures` back to 0. All 326 fixture assets land, each with `upstreamApi` on its `ExternalAssetMapping`.

Triggering the seeded Fleet integration the same way is the check that FLEET fails *visibly*: `status=Error` with the registry's message on the row.

`CREDENTIAL_ENCRYPTION_KEY` (32 bytes, base64) is required wherever an integration with auth is written — it's in `.env.example` and in the `run-npm-tests` job in `ci.yml`. It is deliberately **not** in `.env.ci`: the Blueflow container has no authenticated integration, so nothing there encrypts or decrypts.

## If something's ambiguous

The RFC's "Open Questions" section lists what's genuinely undecided. Anything not there was decided — check the Ground rules table above, and ask rather than choosing for yourself.
