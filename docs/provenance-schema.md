# Provenance: Prisma Schema Changes

### answering provenance questions

| Question | Answer |
|---|---|
| Who set this field, and when? | The newest `FieldChange` for the entity and field, then its `Observation`. With no `FieldChange`, the value is a column default. |
| What was this field at time T? | The newest `FieldChange` at or before T gives `newValue`. If there is none, the field wasn't set yet. |
| Which entities have this field from this source? | The newest `FieldChange` per entity for that field, joined to its `Observation`. |
| What did this sync change? | `FieldChange` rows whose `Observation` has that `integrationId` and `observedAt`. Filter on `kind` to separate new entities from updates. |
| What does this source say now? | That source's newest `Observation` of the entity. |
| Who created this entity? | The entity's `CREATE` observation: its `source`, `integrationName` and `actorUserId`. |

### tracked and ignored fields

Not every field needs a provenance history, so every field on a tracked entity is marked one of two ways:

* `tracked`: a fact that a source or person asserted. Changing it writes a `FieldChange`.
* `ignored`: internal or computed, so it has no source of its own. Changing it writes no `FieldChange`.

| Entity | Field | Mark | Why |
|---|---|---|---|
| `Asset` | `serialNumber` | `tracked` | A source or user states it |
| `Asset` | `location` | `tracked` | A source or user states it |
| `Asset` | `productId` | `tracked` | Resolved from what a source or user states |
| `Asset` | `id`, `createdAt` | `ignored` | Set by the database |
| `Asset` | `updatedAt` | `ignored` | Changes on every write |
| `WorkOrderTicket` | `status` | `tracked` | A source or user states it |
| `WorkOrderTicket` | `submissionState` | `ignored` | Internal state of the submission job |

For example, if a sync changes an asset's `location`, Prisma also bumps `updatedAt`, but only `location`
gets a `FieldChange`.

Each entity has one exhaustive map of its fields, typed from Prisma's generated field names. There is
no default in either direction, so:

* Adding a column or relation is a compile error until someone marks it, so a new field can't go
  untracked by accident.
* Leaving a key for a removed column is also a compile error.

### how a write works

One function, `applyObservation`, writes tracked fields, in one transaction:

1. Normalize the input to our field names and hash it (`contentHash`).
2. If the hash matches this source's newest observation of the entity, write nothing except the
   mapping's `lastSynced`.
3. Insert the `Observation`.
4. Compare it to this source's previous observation to see what changed upstream (the source delta).
   Comparing to the golden record instead would make a stale source look like it changed a
   manually corrected field on every sync.
5. Apply only the fields in the source delta that this write path may apply (newest value wins), update the golden record, and write
   one `FieldChange` per field that actually changed (the golden delta). Creating an entity counts
   every field the source set as changed.

Newest value wins, per field. A field takes the value from whichever source changed it last, including
a user, and a later change from any source overwrites it. A source that keeps sending the same value
hasn't changed it, so it doesn't overwrite a newer value, and two sources that disagree don't flip the
field on every sync.

### rules

* **Creating an entity writes a `CREATE` observation and one `FieldChange` per field the source set,**
  with a null `oldValue`. Every set value therefore has a `FieldChange`, and values from column
  defaults have none. Timelines show these rows as a single "created" entry.
* **Observations store everything a source said, even values that aren't applied.** `applyObservation`
  takes everything the source said, plus a separate list of the fields it may apply, so existing write
  rules don't shape the observation. For example, `ingestFleetAssets` doesn't apply the device on an
  asset Fleet didn't create, but the observation still records it. A `PATCH` holds only the fields it
  changed, because that is all it said.
* **Each payload is stored once.** When a `SourceRecord` already holds the payload, as it does for pulled
  work orders and for notifications, the observation points at it with `sourceRecordId` and leaves `raw`
  null. This also traces an LLM-extracted value back to the document it read. Deleting an integration
  deletes its `SourceRecord`s, so those observations lose the exact payload but keep `fields`, `source`
  and `integrationName`.
* **Foreign key fields are stored as `{ id, label }`,** so history stays readable after the referenced
  row is deleted (the reason `TicketActivity.data` snapshots names today).
* **Set-valued fields get one `FieldChange` per member.** `newValue` only means attached, and
  `oldValue` only means detached. This covers ticket assets, children, links and departments.
* **Values are compared after normalization, with deep equality.** For example, `patchFor` treats
  `""` and `null` bodies as equal, and JSON columns like `location` can't use `!==`.

### who can edit

Existing permissions stay the same, except that any authenticated user can edit or delete any asset.
`Asset` has no owner column, and who created an asset comes from its `CREATE` observation. A synced
asset that a user deletes can come back if its source sends it again.

Other models keep their owner column, which is now null where the owner used to be a shadow user:

| Model | Has an owner | No owner |
|---|---|---|
| `Remediation`, `DeviceArtifact`, `Artifact`, `ArtifactWrapper` | Only that user | No users (an integration created it) |
| `VulnerabilityRecord` with an external mapping | Only that user | No users (an integration created it) |
| `VulnerabilityRecord` with no external mapping | Only that user | Anyone (feed records and MedISAO stubs, as today) |
| `Webhook` | Only that user | Not applicable |

Integrations still update their own rows through sync, which doesn't go through `requireOwnership`.

One accepted change: deleting an integration deletes its mappings, so its records then have no owner
and no mapping, and anyone can edit them. Today they stay locked to the shadow user.

### what source a write has

Email isn't an integration and won't become one, so it has its own source.

| Write | `source` | `actorUserId` |
|---|---|---|
| Integration sync or `integrationUpload/{token}` | `INTEGRATION` | null |
| A person using the UI | `MANUAL` | That user |
| A request using an API key, including TA3 and TA4 | `API_CLIENT` | The API key's user |
| An LLM's own conclusion (triage), or a system rule | `AUTOMATION` | Automation user |
| A chat draft, or a system rule triggered by a person's action | `AUTOMATION` | The user it acted for |
| An LLM extracting from an integration's source record | `INTEGRATION` | Automation user |
| An LLM extracting from a TA4 source record | `API_CLIENT` | Automation user |
| Work order or values extracted from an email | `EMAIL` | Automation user |

An LLM is how a value was produced, not where it came from, so there is no LLM source. If an LLM value
restates what a source said, it takes that source. If the LLM concluded it, it is `AUTOMATION`.
`ctx.auth.key` separates `API_CLIENT` from `MANUAL`: it is set for API keys and undefined for sessions.


## Schema

```prisma
// ─────────────────────────────── Enums ───────────────────────────────

// NEW
/// Where an Observation came from.
enum ProvenanceSource {
  INTEGRATION // integrationName is set, and integrationId until the integration is deleted
  MANUAL      // a person using the UI
  API_CLIENT  // a request using an API key, including TA3 and TA4
  AUTOMATION  // an LLM's own conclusion, or a system rule
  EMAIL       // inbound email
}

// NEW
enum ProvenanceEntityType {
  ASSET // the obvious one IMO. what does each source say about each asset
  WORK_ORDER // replaces TicketActivity which is fairly important
  NOTIFICATION // replaces FieldChange, also notifications are often getting updates from sources/LLMs so provenance tracking and history seems useful here
}

// NEW
enum ObservationKind {
  CREATE    // this observation created the entity; there is one per entity
  SNAPSHOT  // the source's view: a missing key means it said nothing about that field
  PATCH     // only the fields in the payload changed, e.g. a manual edit
  TOMBSTONE // the source reports the record was deleted, or a user deleted it
}

// REMOVED enum CorrectionTargetType → ProvenanceEntityType
// REMOVED enum TicketActivityType → FieldChange, plus the sources listed under TicketActivity below

// ───────────────────────────── Provenance ─────────────────────────────

// NEW
/// What one source told us about one entity. Append-only.
/// Written only when contentHash differs from this source's newest observation of the entity.
/// "Still saying this" stays on the mapping's lastSynced.
model Observation {
  id String @id @default(cuid())

  // No foreign key: entityId can point at any tracked model, and a Postgres foreign key targets one
  // table. SetNull wouldn't help either: it would lose which deleted entity this history belongs to.
  entityType ProvenanceEntityType
  entityId   String

  source ProvenanceSource

  // Only for source = INTEGRATION. Integrations are hard deleted, which nulls integrationId. The row
  // still has source = INTEGRATION and integrationName, so it never reads as another source.
  integrationId   String?
  integration     Integration? @relation(fields: [integrationId], references: [id], onDelete: SetNull)
  integrationName String? // snapshot; set exactly when source = INTEGRATION (CHECK constraint in raw SQL)

  // The user, API key's user, or automation user
  actorUserId String?
  actor       User?   @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  // The document this came from, when a SourceRecord holds it. Null for most asset writes.
  sourceRecordId String?
  sourceRecord   SourceRecord? @relation(fields: [sourceRecordId], references: [id], onDelete: SetNull)

  kind   ObservationKind
  fields Json  // everything the source said, normalized to our field names; compared for the source delta
  raw    Json? // the exact payload, null when sourceRecordId is set; TODO: keep PHI/PII concerns in mind

  contentHash String // hash of `fields`, so noise in `raw` doesn't create rows

  observedAt      DateTime  @default(now()) // when we received it

  fieldChanges FieldChange[]

  @@index([entityType, entityId, observedAt]) // an entity's history
  @@index([entityType, entityId, kind]) // its CREATE observation
  @@index([entityType, entityId, source, integrationId, observedAt(sort: Desc)]) // source's newest
  @@index([integrationId, observedAt]) // what a sync changed
  @@index([actorUserId])
  @@index([sourceRecordId])
  @@map("observation")
}

// NEW: replaces FieldCorrection
/// One field changing on the golden record, including being set when the entity is created.
/// Append-only.
model FieldChange {
  id String @id @default(cuid())

  // No foreign key: entityId can point at any tracked model, and a Postgres foreign key targets one
  // table. SetNull wouldn't help either: it would lose which deleted entity this history belongs to.
  entityType ProvenanceEntityType
  entityId   String
  field      String // the column name, e.g. "serialNumber", "assigneeId", "assets"

  oldValue Json? // see the rules above for foreign key and set-valued fields
  newValue Json?
  reason   String? @db.Text // why, e.g. triage's reasoning or "all-child-tickets-done"

  observationId String
  observation   Observation @relation(fields: [observationId], references: [id], onDelete: Restrict)

  changedAt DateTime @default(now())

  @@index([entityType, entityId, field, changedAt(sort: Desc)]) // who set this field
  @@index([entityType, entityId, changedAt]) // an entity's timeline
  @@index([entityType, field, changedAt]) // recent changes, e.g. the overview page's status changes
  @@index([observationId])
  @@map("field_change")
}

// REMOVED model FieldCorrection → FieldChange

// REMOVED model TicketActivity:
//   WORK_ORDER_CREATED                    → the ticket's CREATE Observation
//   STATUS, CATEGORY, PRIORITY, ASSIGNEE,
//   SCHEDULED_AT, SCHEDULED_END, SUMMARY,
//   DESCRIPTION, DEPARTMENTS _CHANGED     → FieldChange
//   CHILD, ASSET _ATTACHED / _DETACHED,
//   TICKET_LINKED / _UNLINKED             → FieldChange, one row per member
//   RESCHEDULE_*                          → RescheduleRequest, which already holds who, when and status

// ───────────────────────────── Integrations ─────────────────────────────

// NEW: replaces UserToken, which only integrations use
/// A one-time, resource-scoped token that lets an integration push data back.
model IntegrationToken {
  id            String      @id @default(cuid())
  integrationId String
  integration   Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  tokenHash     String      @unique
  resource      ResourceType // CHANGED: was `permissions String?`
  expiresAt     DateTime
  createdAt     DateTime    @default(now())

  @@index([integrationId])
  @@index([expiresAt])
  @@map("integration_token")
}

// REMOVED model UserToken → IntegrationToken

model Integration {
  // ...
  // REMOVED integrationUserId, integrationUser: attribution → Observation, auth → IntegrationToken

  /// CHANGED: nullable. Null for system integrations with no human creator, like CISA CSAF.
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokens       IntegrationToken[] // NEW
  observations Observation[]      // NEW
}

// ─────────────────────────── Golden records ───────────────────────────

model Asset {
  // ...
  // REMOVED userId, user → the CREATE Observation
}

model Remediation {
  // ...
  /// CHANGED: nullable. Set when a user creates the row, null when an integration does.
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// CHANGED the same way as Remediation.userId: DeviceArtifact, Artifact, ArtifactWrapper

model WorkOrderTicket {
  // ...
  /// CHANGED: nullable. Null for tickets an integration created. Not an ownership column:
  /// it stays because interruptions use it as the contact when a ticket has no assignee.
  creatorId String?
  creator   User?   @relation("WorkOrderTicketCreator", fields: [creatorId], references: [id], onDelete: Cascade)

  // REMOVED activities TicketActivity[]
}

model VulnerabilityRecord {
  // ...
  /// CHANGED meaning: the API user who owns it. Null for integration records as well as feed
  /// records and MedISAO stubs. See "who can edit".
  userId String?
}

// ─────────────────────────── Back-relations ───────────────────────────

model User {
  // ...
  // REMOVED assets
  // REMOVED integrationUser Integration? @relation("integration_user")
  // REMOVED userTokens UserToken[]
  // REMOVED fieldCorrections FieldCorrection[]
  // REMOVED ticketActivities TicketActivity[]
  observations Observation[] // NEW
}

model SourceRecord {
  // ...
  observations Observation[] // NEW
}
```

### not changing

* `External*Mapping`: still the record of which external ID maps to which entity
* `VulnerabilityRecord` and `Metric`: still hold each source's parsed claims, which the UI shows side by
  side. `VulnerabilityRecord.raw` stays on the record
* `VulnerabilitySource`, `SourceChannel`, `SourceRecord`: email, EPSS and KEV stay outside `Integration`,
  so these stay as they are, apart from the new back-relation on `SourceRecord`
* The automation user: it stays as the actor for VIPER's own automated writes
* `TicketComment`, `TicketWatch`, `TicketSeen`: not provenance
* `Webhook.userId`, `ChatThread.userId`, `CsvImport.userId`, `Note.userId`: these belong to a person or
  record an action that isn't a tracked field

## TODO

### provenance core

- [ ] Add `applyObservation` and value normalization. It takes everything the source said, plus the
      fields it may apply
- [ ] Set the source from `ctx.auth.key` on tRPC writes: `API_CLIENT` with a key, `MANUAL` without one
- [ ] Record values that are dropped today: `ingestFleetAssets`, `enrichAssetIdentifiers`
- [ ] Add an exhaustive `tracked` / `ignored` map for each `ProvenanceEntityType`, typed from Prisma's
      generated field names so a missing or stale key fails to compile. `applyObservation` reads
      this map to decide which fields get a `FieldChange`
- [ ] Add a type test proving that a missing key fails. CI already runs `tsc --noEmit`, which
      turns this into a failed check
- [ ] Add read helpers for the questions above
- [ ] Route integration writes for tracked entities through it: `processIntegrationSync`, which also
      serves untracked models like remediations and must skip provenance for them
- [ ] Route asset writes: `assets.create`, `createBulk`, `update`, `remove`, `enrichAssetIdentifiers`
- [ ] Route work order writes: tracking routers, `reschedule.ts`, `asset-tickets.ts`, mitigation
      routers, `work-orders/submit.ts`, `work-order-tools.ts`, `process-inbox-email`
- [ ] Route notification writes: `inbox/pipeline.ts`, `triage/persist.ts`, the inbox router,
      `analyze-remediation.ts`
- [ ] Set `sourceRecordId` on observations for work orders and notifications. `recordWorkOrderSources`
      runs after `processIntegrationSync` today, so the order has to change
- [ ] Callers using `updateMany` must read the affected rows first to know the old values
- [ ] Return the PATCH response from `pushEditToPlatforms` and record it as the integration's observation
- [ ] Keep the behavior of `fleetCreatedEquipmentKeys`, reading who created the asset from its `CREATE`
      observation, since `Asset.userId` is gone
- [ ] Make demo seeds write through `applyObservation`, or their rows have no provenance
- [ ] Add the raw SQL CHECK constraint on `Observation`

### removing shadow users

- [ ] Replace `createUserToken` and `consumeUserToken` with integration versions, and update `purgeExpiredTokens`
- [ ] `processIntegrationToken` returns only `integrationId`; `createCallback` takes an `integrationId`
- [ ] Remove `integrationUserId` from `ResourceSyncCtx`, and the `userId` parameter from
      `processIntegrationSync` and `transformInputItem`
- [ ] Stop creating shadow users in `create-integration.ts`, and remove the name sync in the integrations router
- [ ] Update `csaf-integration.ts`, `dev/fleet-integration.ts`, `create-blueflow-integration.ts`,
      `seed-csaf-advisories.ts`
- [ ] Handle null `creatorId` in `asset-tickets.ts`, `interruptions.ts`, `tracking/types.ts`, tracking
      `columns.tsx` and `overview-card.tsx`
- [ ] Show the source name when the owner is null: remediation and device artifact columns,
      `remediations.tsx`, `vulnerabilities/utils.ts`, `vulnerability-drawer.tsx`
- [ ] Replace `isAutomationActor` in `activity-timeline.tsx`, which checks for a shadow user, with
      `source = AUTOMATION`. Do the same for `isAgent` in the inbox router
- [ ] Filter the automation user out of `listAssignable`. Shadow users leave that list on their own

### changing ownership

- [ ] Remove `requireOwnership` from `assets.update` and `assets.remove`, and `asset` from `OwnableModel`
- [ ] Records router: `allowUnowned` would let anyone edit integration records once they have a null
      `userId`, so also refuse null-owner records with an external mapping
- [ ] Update `requireOwnership`'s tests, API tests that expect `FORBIDDEN` from those asset routes,
      and their OpenAPI descriptions
- [ ] Stop setting `userId` on assets, and on rows an integration creates in the `*IntegrationSync` functions
- [ ] Remove `user` from `assetInclude` and the asset schemas
- [ ] Read the asset's creator from its `CREATE` observation in `assets/utils.ts`. List pages need a
      batched query per page

### removing TicketActivity and FieldCorrection

- [ ] Build the ticket timeline from `FieldChange`, `RescheduleRequest` and comments, collapsing `CREATE`
      rows into one entry. Actors come from `observation.actor`
- [ ] Remove `recordUpdateActivities`, `snapshotBeforeUpdate`, `recordCreationActivity` and the
      other writers in `activities.ts`
- [ ] Move the `cause` in `data` to `FieldChange.reason`
- [ ] Read `advisoryTitle` and `displayId` live rather than from the `WORK_ORDER_CREATED` snapshot
- [ ] Update `overview/server/routers.ts`, which reads status changes and joins through the
      ticket relation (`isDraft`, `summary`). This becomes a second query
- [ ] Remove `recordFieldCorrections`; update `inbox/server/routers.ts` and
      `notification-activity-timeline.tsx`
- [ ] Update `dev/work-orders.ts` and `seed-recent-changes.ts`
- [ ] Decide how synced changes appear in the timeline. Sync records only a creation entry today, so
      field changes from integrations would be new there

### API and docs

- [ ] `/api/v1` breaking changes to list in the PR: `user` and `userId` removed from assets; nullable `user`
      and `userId` on remediations, device artifacts and artifacts; nullable `creator`; `activities` on
      tickets
- [ ] Update `CLAUDE.md` (key models, background jobs) and the shadow user comments in `vulnerability-schema.md`

## Out of scope

* **Field reconciliation:** source precedence, protecting manual edits, and flagging conflicts. A user's
  edit is overwritten as soon as a source changes that field. Observations keep what every source said,
  so this can be added later without a schema change.
* **`raw` retention:** payloads are kept forever during alpha.
* **`Remediation` and `DeviceArtifact`:** no provenance tracking for now.
* **`Vulnerability` and `VulnerabilityRecord`:** multiple records already say which source claimed what,
  and the only source-written `Vulnerability` field that changes after creation is `description`. Past
  values of a record aren't kept, as today. For CVSS history later, store metrics in `Observation.fields`
  and compare observations: `Metric` rows are deleted and recreated on update, and EPSS can change nightly.
* **`Issue`:** verdicts have no external sources, so they aren't part of this work. Nothing records who
  marked an issue `NOT_AFFECTED`, which is worth solving separately as an audit feature.
