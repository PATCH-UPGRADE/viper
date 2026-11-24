# Provenance: Prisma Schema Changes

### answering provenance questions

| Question | Answer |
|---|---|
| Who set this field, and when? | The newest `FieldChange` for the entity and field, then its `Observation`. With no `FieldChange`, the value is a column default, or has been empty since the entity was created. |
| What was this field at time T? | The newest `FieldChange` at or before T gives `newValue`. If there is none, the field wasn't set yet. |
| Which entities have this field from this source? | The newest `FieldChange` per entity for that field, joined to its `Observation`. |
| What did this sync change? | The `Observation`s with that `entityType`, `integrationId` and `observedAt`, which all observations from one sync share, joined to their `FieldChange`s. `kind` separates created, updated and deleted entities. A `TOMBSTONE` has no `FieldChange`s. |
| What does this source say now? | For an integration, its newest `CREATE` or `SNAPSHOT` of the entity. Other sources only write a `PATCH` when they change something, so use the `FieldChange`s. |
| Who created this entity? | The entity's `CREATE` observation: its `source`, `integrationName` and `actorUserId`. |

"Newest" always means the highest `seq`.

### tracked and ignored fields

Not every field needs a provenance history, so every field on a tracked entity is marked one of two ways:

* `tracked`: a fact that a source or person asserted. Changing it writes a `FieldChange`.
* `ignored`: internal, computed, or not worth a history. It is left out of `Observation.fields`, and changing
  it writes no `FieldChange`. A write that includes one still saves it to the golden record.

| Entity | Field | Mark | Why |
|---|---|---|---|
| `Asset` | `serialNumber` | `tracked` | A source or user states it |
| `Asset` | `location` | `tracked` | A source or user states it |
| `Asset` | `productId` | `tracked` | Resolved from what a source or user states |
| `Asset` | `utilization` | `ignored` | A large hourly grid, so each change would store several copies of it |
| `Asset` | `networkSegment`, `role`, `status` | `ignored` | Likely to change significantly, so not worth a history yet |
| `Asset` | `id`, `createdAt` | `ignored` | Set by the database |
| `Asset` | `updatedAt` | `ignored` | Changes on every write |
| `WorkOrderTicket` | `status` | `tracked` | A source or user states it |
| `WorkOrderTicket` | `submissionState` | `ignored` | Internal state of the submission job |

For example, if a sync changes an asset's `location`, Prisma also bumps `updatedAt`, but only `location`
gets a `FieldChange`.

An `ignored` field isn't compared to anything, so every write that includes it overwrites it, as today. A partner
upload or AI crawl that states an asset's `role` replaces a user's edit of it on each sync.

Each entity has one exhaustive map of its fields, typed from Prisma's generated field names. There is
no default in either direction, so:

* Adding a column or relation is a compile error until someone marks it, so a new field can't go
  untracked by accident.
* Leaving a key for a removed column is also a compile error.

### field groups

Some fields are only valid together, so they are applied together:

| Entity | Group | Fields |
|---|---|---|
| `Asset` | `device` | `manufacturerId`, `productId`, `versionId`, `versionStatus` |
| `WorkOrderTicket` | `schedule` | `scheduledAt`, `scheduledEndTime` |

If a source changes one field of a group, every field of the group that it stated is applied. A write path may
apply all of a group or none of it. The type of a write requires all four `device` fields or none, because the
database does: a version must belong to its product, and a product to its manufacturer.

A source can state only one `schedule` field, and the other keeps its value. The exception keeps the window
valid: if a source states a start but no end, and the end VIPER has isn't after the new start, the end is
cleared. It is cleared too if the new start is null. Partner uploads have no `scheduledEndTime`, so a partner
could otherwise move the start past an end that a user set. A user's edit is rejected instead, by
`assertTimeRange`. Clearing the end writes a `FieldChange` like any other change.

For example, Fleet reports product P1 with no version, and a user sets version V1. When Fleet corrects the
product to P2, still with no version, the asset gets P2 and no version. Applying only `productId` would leave
P2 with a version of P1, so the foreign key would reject the write, and every later sync of that asset would
fail the same way.

A group only decides what is applied. Each field still gets its own `FieldChange`, only if its value changed.

### how a write works

One function, `applyObservation`, updates tracked fields. `createWithObservation` and
`deleteWithObservation` do the same for creating and deleting an entity. Each runs in one transaction.
`applyObservation` works like this:

1. Lock the entity's row, so two writers can't compare against the same old values.
2. Normalize the input to our field names.
3. Find which fields changed. This depends on the kind:
   * **A `SNAPSHOT` is compared to the same source's newest `CREATE` or `SNAPSHOT` of the entity** (the source
     delta). Comparing to the golden record instead would make a stale source look like it changed a manually
     corrected field on every sync.
   * **A `PATCH` is compared to the golden record.** It is a request to set these values now, so what the
     same source said earlier doesn't matter. If a user sets a location to ER, an integration changes it to
     ICU, and the user sets ER again, the second edit applies.
4. Stop if a `SNAPSHOT` has the same `fields` as that newest one, or a `PATCH` changed no field. Only the
   mapping's `lastSynced` and any `ignored` fields in the input are written. A `CREATE` or `TOMBSTONE` is
   never skipped as a duplicate.
5. Insert the `Observation`.
6. Apply only the changed fields that this write path may apply (newest value wins), plus the rest of any
   field group they belong to, see "field groups". Update the golden record, and write one `FieldChange` per
   field that actually changed (the golden delta). Any `ignored` fields in the input are written too. Creating
   an entity counts every `tracked` field the source set to a non-null value as changed.

A missing key in a `SNAPSHOT` means the source said nothing about that field. The `SNAPSHOT` is saved without
it, and the golden record keeps its value. An explicit null is a statement that the field is empty. If the
source reports the field again later, that counts as a change, even if the value is the one it reported before,
so it can overwrite a user's edit once. That is accepted, because only AI crawls and partner uploads can leave
out a tracked field. Fleet and ServiceNow always send the same ones.

A missing `device` works the same way: none of its four fields are stated, and the asset keeps its device. Today
`processAssetIntegrationSync` turns a missing `device` into nulls, which clears it, so that has to change. An
explicit null still clears it.

Newest value wins, per field or field group. A field takes the value from whichever source changed it last, including
a user, and a later change from any source overwrites it. A source that keeps sending the same value
hasn't changed it, so it doesn't overwrite a newer value, and two sources that disagree don't flip the
field on every sync.

### rules

* **Creating an entity writes a `CREATE` observation and one `FieldChange` per `tracked` field the
  source set to a non-null value,** with a null `oldValue`. Every such value therefore has a `FieldChange`, and values from column
  defaults have none. Timelines show these rows as a single "created" entry.
* **A draft work order isn't tracked until it is promoted.** Regenerating mitigation plans deletes and
  recreates drafts, so tracking them would add a lot of history that nobody reads. The
  provenance functions create, update and delete a draft without writing any rows, so deleting a draft that
  was never promoted writes no `TOMBSTONE`. Promotion calls `createWithObservation`, whose callback clears
  `isDraft` instead of creating a row, and it writes the `CREATE` observation from the draft's values. A promoted ticket that
  becomes a draft again, because another plan was accepted, stays tracked. Promoting it again
  only changes `isDraft`, which is `ignored`, so it doesn't write a second `CREATE`.
* **Observations store every `tracked` field a source stated, even values that aren't applied.**
  `applyObservation` takes everything the source said, plus a separate list of the fields it may apply, so existing write
  rules don't shape the observation. For example, `ingestFleetAssets` doesn't apply the device on an
  asset Fleet didn't create, but the observation still records it. A `PATCH` holds only the fields it
  changed. Its input can have more, like all four `device` fields, and the unchanged ones aren't stored.
* **`raw` is stored only for work orders from an integration.** Every other observation leaves it null. When a
  `SourceRecord` already holds the payload, as it does for notifications and emailed work orders, the
  observation points at it with `sourceRecordId`. This also traces an LLM-extracted value back to the document
  it read. Deleting an integration deletes its `SourceRecord`s, so those observations lose the exact payload
  but keep `fields`, `source` and `integrationName`.
* **Foreign key fields are stored as `{ id, label }`,** so history stays readable after the referenced
  row is deleted (the reason `TicketActivity.data` snapshots names today). Only the `id` is
  compared, so renaming a product isn't a change to its assets.
* **Set-valued fields get one `FieldChange` per member.** `newValue` only means attached, and
  `oldValue` only means detached. This covers ticket assets, children, links and departments.
  `Observation.fields` holds the whole set after the change, as a list of `{ id, label }` that is compared
  without order. Linking two tickets changes both, so it writes one observation per ticket. Attaching a child
  or an asset writes one on the parent.
* **Values are compared after normalization, with deep equality.** For example, `patchFor` treats
  `""` and `null` bodies as equal, and JSON columns like `location` can't use `!==`.
* **All observations from one sync share one `observedAt`,** the time the sync started or its request arrived. Each
  item is saved in its own transaction, so the `now()` default would give each one a different time. The
  caller of `processIntegrationSync` picks the time once and passes it in, because one sync can make several
  calls: a CSV import makes one per row. A pull uses the time it starts, `integrationUpload` the time of the
  request, and a CSV import its `CsvImport.createdAt`, which is when the file was received. Two writes from an
  integration aren't part of a sync: an LLM extraction from its source record uses `SourceRecord.observedAt`, and
  the response to a pushed edit uses the time of the response. The type of a write's origin makes forgetting `observedAt` a compile error, see "what source a write has".
* **Rows are ordered by `seq`, an autoincrement column, and not by `observedAt` or `changedAt`.** A sync's shared
  `observedAt` is set when the sync starts, so a user's edit during the sync can look newer than a sync write
  that landed after it. Every write locks the entity's row first, so `seq` matches the real order of writes
  to that entity. `observedAt` and `changedAt` are for showing times, filtering by time and finding a sync.

### where a work order came from

Work orders use `SourceRecord` only for email, which is what it was added to them for. Integration tickets
don't need it: `ExternalWorkOrderMapping` says which external record they came from, and `Observation`
holds the payload and history.

| Ticket comes from | Link to where it came from | Payload |
|---|---|---|
| ServiceNow or Fleet pull | `ExternalWorkOrderMapping` | `Observation.raw` |
| `integrationUpload` | `ExternalWorkOrderMapping` | `Observation.raw` |
| Email | `SourceLink` to the email's `SourceRecord` | `SourceRecord`, through `Observation.sourceRecordId` |
| A person, or chat | None | None |

Two accepted changes for integration tickets:

* A change to a payload field we don't map, like `work_notes`, writes no observation, so that version of
  `raw` isn't kept.
* A ticket deleted upstream and later restored gets a new `entityId`, so its history starts fresh.

### who can edit

Existing permissions stay the same, except that any authenticated user can edit or delete any asset.
`Asset` has no owner column, and who created an asset comes from its `CREATE` observation. A synced
asset that a user deletes can come back if its source sends it again.

Other models keep their owner column, which is null for rows that an integration creates:

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
| CSV import | `INTEGRATION` | The uploader (`CsvImport.userId`) |
| A person using the UI | `MANUAL` | That user |
| A request using an API key, including TA3 and TA4 | `API_CLIENT` | The API key's user |
| An LLM's own conclusion (triage), or a system rule | `AUTOMATION` | Automation user |
| A draft being promoted: an accepted plan, or an approved chat proposal | `AUTOMATION` | The user who accepted it |
| A system rule triggered by a person's action | `AUTOMATION` | The user it acted for |
| An LLM extracting from an integration's source record | `INTEGRATION` | Automation user |
| An LLM extracting from a TA4 source record | `API_CLIENT` | Automation user |
| Work order or values extracted from an email | `EMAIL` | Automation user |

An LLM is how a value was produced, not where it came from, so there is no LLM source. If an LLM value
restates what a source said, it takes that source. If the LLM concluded it, it is `AUTOMATION`.
`ctx.auth.key` separates `API_CLIENT` from `MANUAL`: it is set for API keys and undefined for sessions.

Every write passes its origin, and the type requires what each source needs. A write from an integration
doesn't compile without `observedAt` and `integrationName`, and a write from any other source doesn't
compile without an actor:

```ts
type ObservationOrigin =
  | {
      source: "INTEGRATION";
      integrationId: string;
      integrationName: string;
      observedAt: Date; // required: one value for the whole sync
      actorUserId?: string;
    }
  | {
      source: "MANUAL" | "API_CLIENT" | "AUTOMATION" | "EMAIL";
      actorUserId: string;
      observedAt?: Date; // defaults to now
    };
```

### typed writes

A direct write to `Asset`, `WorkOrderTicket` or `Notification` doesn't compile. `src/lib/db.ts` exports the same
client as today, with a type that has only the read methods of those models. It narrows `TransactionClient` the
same way, so `$transaction` needs its type restated. Nothing changes at runtime.

```ts
tx.workOrderTicket.create({ … });  // compile error
createWithObservation(tx, …, (raw) => raw.workOrderTicket.create({ … }));  // fine
```

* **The type lists the read methods to keep, not the write methods to remove,** so a write method that a Prisma
  upgrade adds is blocked by default. It also keeps the delegate's symbol keys, because the asset types in
  `assets/types.ts` are inferred from them.
* **`src/lib/db-raw.ts` has one function, `asRaw`,** which casts a client or a `tx` to its full type. It imports
  only types from `db.ts`. Tests that mock `@/lib/db` therefore keep working, and there is no import cycle with
  the Prisma extensions, which import `db.ts`.
* **Only the provenance module uses `asRaw`.** It gives the raw client to the callbacks of
  `createWithObservation` and `deleteWithObservation`. A helper that a callback calls takes a
  `RawTransactionClient`, a type from `db.ts`.
* **`processIntegrationSync` takes the entity type of a tracked model, not its delegate,** and writes through the
  provenance functions. Platforms never hold a client that can write. Untracked models, like remediations, still
  pass their delegate.

A Biome `noRestrictedImports` rule blocks importing `db-raw`, and importing `PrismaClient` from the generated
client. Its overrides are `db.ts` for `PrismaClient`, the provenance module for `db-raw`, and tests and `scripts/`
for both. It must use `patterns`, because `paths` misses relative imports. CI already runs `tsc --noEmit` and
`biome ci`.

Two helpers in the provenance module cover the writes that need no observation, so `src/` has no other overrides:

* `updateIgnoredFields(client, entityType, where, data)` accepts only the `ignored` fields of that entity, and
  returns the count, which `claimForSubmission` needs. Examples are `submissionState`, `lastCommentAt` and
  returning a ticket to draft. It also checks the fields at runtime, because TypeScript accepts an extra field in
  a variable or a spread.
* `deleteDrafts(client, where)` deletes only drafts. `mitigation/persist.ts` uses it.

A model is narrowed in the PR that routes its last write: `Asset` in PR 4, `WorkOrderTicket` in PR 11 and
`Notification` in PR 13. Narrowing one flags every direct write that is left, including any that were merged in
the meantime. Until then, nothing stops a new one.

This is defense in depth, so these gaps are accepted:

* **Casts, `any` and `$extends`,** which all give back the write methods.
* **Raw SQL.**
* **Nested writes.** `mitigationPlan.create` with nested `workOrders` is a write to `MitigationPlan`.
* **Database cascades.** Postgres runs them, so no code names the affected rows.
* **Set-valued fields.** Their rows are in other tables, like `AssetTicket` and `WorkOrderTicketLink`.
* **Callbacks.** The raw client in one can write any tracked model, not only the entity it is for.
* **`isDraft: false` through `updateIgnoredFields`,** which would promote a draft without a `CREATE`. Promoting a
  ticket again needs it.
* **Tests and `scripts/`.** The rows that they write with `asRaw` have no provenance.

### existing rows

There is no production data, so nothing is backfilled or migrated, and every database is reset instead:
staging, and each developer's local one. The migrations only change the schema. A database that isn't reset
keeps assets with no `CREATE`, which show no creator, and Fleet stops updating the device on the ones it
created.

Reset once, with `npx prisma migrate reset`, after PR 9 (see "PR order"). By then all asset writes, the work
order sync, every other path that creates a work order or notification, and the demo seeds go through the
provenance functions, and the code no longer creates or reads shadow users. `npm run db:seed` isn't enough,
because it skips the demo data if it is already loaded. The PRs after the reset only route edits and drop
tables, so they don't need another one.

Accepted changes:

* A reset deletes everything, including users, integrations and their credentials, which have to be entered
  again.
* The old `TicketActivity` and `FieldCorrection` rows are dropped, not migrated.
* Edits to work orders and notifications between the reset and PRs 10, 11 and 13 are recorded only in
  `TicketActivity` or `FieldCorrection`, so they have no history once those are dropped. Until such a field
  changes again, its newest `FieldChange` can be out of date.
* Migrations run on the main Neon branch when they merge, so from PR 5 until the reset, staging has the problems
  of a database that isn't reset. Shadow users also stay assignable. Merge PRs 5 to 9 close together.

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
  NOTIFICATION // replaces FieldCorrection, also notifications are often getting updates from sources/LLMs so provenance tracking and history seems useful here
}

// NEW
enum ObservationKind {
  CREATE    // this observation created the entity, or promoted it from draft; there is one per entity
  SNAPSHOT  // the source's view: a missing key means it said nothing about that field
  PATCH     // only the fields in the payload changed, e.g. a manual edit
  TOMBSTONE // the source reports the record was deleted, or a user deleted it
}

// REMOVED enum CorrectionTargetType → ProvenanceEntityType
// REMOVED enum TicketActivityType → FieldChange, plus the sources listed under TicketActivity below

// ───────────────────────────── Provenance ─────────────────────────────

// NEW
/// What one source told us about one entity. Append-only.
/// A SNAPSHOT is written only when `fields` differs from this source's newest CREATE or SNAPSHOT of the
/// entity, and a PATCH only when it changes a field. CREATE and TOMBSTONE are never deduplicated.
/// "Still saying this" stays on the mapping's lastSynced.
model Observation {
  id  String @id @default(cuid())
  seq Int    @default(autoincrement()) // the order rows were written in

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

  // The document this came from, when a SourceRecord holds it: notifications and emailed work orders.
  sourceRecordId String?
  sourceRecord   SourceRecord? @relation(fields: [sourceRecordId], references: [id], onDelete: SetNull)

  kind   ObservationKind
  // Every tracked field the source stated, normalized to our field names; compared for the source delta.
  // `{}` on a TOMBSTONE.
  fields Json
  raw    Json? // the exact payload, only for work orders from an integration; TODO: keep PHI/PII concerns in mind

  observedAt      DateTime  @default(now()) // see the rules above; the same for a whole sync

  fieldChanges FieldChange[]

  @@index([entityType, entityId, seq]) // an entity's history
  @@index([entityType, entityId, kind]) // its CREATE observation
  @@index([entityType, entityId, source, integrationId, seq]) // what a source said last
  @@index([integrationId, observedAt]) // what a sync changed
  @@index([actorUserId])
  @@index([sourceRecordId])
  @@map("observation")
}

// NEW: replaces FieldCorrection
/// One field changing on the golden record, including being set when the entity is created.
/// Append-only.
model FieldChange {
  id  String @id @default(cuid())
  seq Int    @default(autoincrement()) // the order rows were written in

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

  @@index([entityType, entityId, field, seq(sort: Desc)]) // who set this field
  @@index([entityType, entityId, seq]) // an entity's timeline
  @@index([entityType, field, changedAt]) // recent changes, e.g. the overview page's status changes
  @@index([observationId])
  @@map("field_change")
}

// REMOVED model FieldCorrection → FieldChange. Existing rows are dropped.

// REMOVED model TicketActivity. Existing rows are dropped. New history comes from:
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
* `SourceLink`: `workOrderTicketId` stays, but only emailed tickets use it
* The automation user: it stays as the actor for VIPER's own automated writes
* `TicketComment`, `TicketSeen`: not provenance
* `Webhook.userId`, `ChatThread.userId`, `CsvImport.userId`, `Note.userId`: these belong to a person or
  record an action that isn't a tracked field

## PR order

The goal is under about 2,000 LOC per PR, not counting migrations, generated code and this doc. Sizes are
estimates, except for PR 1.

| # | PR | LOC | Needs |
|---|---|---|---|
| 1 | Integration tokens (#421) | 370 | |
| | **Assets** | | |
| 2 | Core: `Observation`, `FieldChange`, the write functions, the asset map, field groups | 1,500 | 1 |
| 3 | Asset writes outside sync, and the asset demo seeds | 900 | 2 |
| 4 | Asset sync: `processIntegrationSync`, Fleet, partner, AI, CSV; typed writes, narrowing `Asset` | 1,600 | 3 |
| 5 | Drop `Asset.user`: ownership, the Sources column, `fleetCreatedEquipmentKeys` | 700 | 4 |
| | **Shadow users** | | |
| 6 | Nullable owners and `creatorId`, the records router guard, source names in the UI | 800 | 1 |
| 7 | Delete shadow users, nullable `Integration.userId` | 700 | 5, 6 |
| | **`CREATE` for everything else** | | |
| 8 | Work order sync: the work order map, ServiceNow, Fleet, `integrationUpload`, upstream deletes, removing `SourceRecord` | 1,300 | 4, 7 |
| 9 | Remaining creates: tickets from the UI, chat, email, asset sub-tickets and draft promotion; the notification map and creates; their demo seeds | 1,000 | 8 |
| | **Reset staging and local databases** | | 9 |
| | **Edits** | | |
| 10 | Work order edits in tracking: update, attach, link, reschedule, delete; `updateIgnoredFields` | 1,400 | 9 |
| 11 | Other work order edits: plan edits, submit, the push-edit response; `deleteDrafts`, narrowing `WorkOrderTicket` | 800 | 10 |
| 12 | Switch the ticket timeline and overview to `FieldChange`, drop `TicketActivity` | 1,800 | 11 |
| 13 | Notification edits and timeline, narrowing `Notification`, drop `FieldCorrection` | 700 | 9 |

PR 6 can be worked on alongside 2 to 5, and 13 alongside 10 to 12. If PR 4 gets too big, the typed
writes can be their own PR after it. Each PR makes the doc, `CLAUDE.md` and API changes for what it ships.

* PR 2 adds the whole `Observation` and `FieldChange` schema, including every enum value, `sourceRecordId`,
  `seq` and the CHECK constraint, so no later PR changes those tables.
* Each tracked / ignored map is settled before the reset. Marking a field `tracked` later doesn't need a reset,
  but existing rows have no history for it.
* The records router guard ships in PR 6 with the nullable owners. Otherwise `allowUnowned` would let anyone
  edit integration records.

### temporary behavior

Code that a later PR in this stack will change gets a `TODO VW-605` comment that says what changes and in
which PR:

```ts
// TODO VW-605 (PR 12): a synced ticket has no creator, so it gets no "created" entry here. Its
// CREATE observation replaces this.
if (!t.creatorId) return;
```

The PR that makes the change removes the comment. After PR 13, `git grep "TODO VW-605"` should find nothing in
the code.

| Temporary behavior | Added or kept in | Changed in |
|---|---|---|
| `processIntegrationToken` returns the shadow user's id | 1 | 7 |
| Asset writes and syncs still set `Asset.userId` | 3, 4 | 5 |
| `assets.remove` deletes tickets without a `TOMBSTONE` | 3 | 10 |
| `processIntegrationSync` still takes a `userId` | 4 | 7 |
| `processIntegrationSync` skips provenance for work orders, which still pass their delegate | 4 | 8 |
| `WorkOrderTicket` isn't narrowed | 4 | 11 |
| `Notification` isn't narrowed | 4 | 13 |
| `recordCreationActivity` returns early when `creatorId` is null, so synced tickets show no "created" entry. Those created after the reset get one from their `CREATE` | 6 | 12 |
| `isAutomationActor` compares with `AUTOMATION_USER_ID` | 7 | 12 |
| Creating or promoting a ticket writes both a `CREATE` and `TicketActivity` | 9 | 12 |
| Editing a ticket writes both `FieldChange` and `TicketActivity` | 10, 11 | 12 |

## TODO

### provenance core

- [ ] Add `applyObservation`, `createWithObservation`, `deleteWithObservation` and value normalization.
      `applyObservation` takes everything the source said, plus the fields it may apply
- [ ] Add the `ObservationOrigin` type, with a type test proving that an integration write without
      `observedAt` fails to compile
- [ ] Set the source from `ctx.auth.key` on tRPC writes: `API_CLIENT` with a key, `MANUAL` without one. Do it
      in one helper, so a source for AI writes can be added there later (see "out of scope")
- [ ] Record values that are dropped today: `ingestFleetAssets`, `enrichAssetIdentifiers`
- [ ] Add an exhaustive `tracked` / `ignored` map for each `ProvenanceEntityType`, typed from Prisma's
      generated field names so a missing or stale key fails to compile. `applyObservation` reads
      this map to decide which fields get a `FieldChange`
- [ ] Add the field groups. Require all `device` fields or none in a write's type. Test that a source changing
      the product clears a version that a user set on the old product, and that a source moving the start past
      the end clears the end
- [ ] Add a type test proving that a missing key fails. CI already runs `tsc --noEmit`, which
      turns this into a failed check
- [ ] Add each read helper for the questions above in the PR that first uses it
- [ ] Route integration writes for tracked entities through it: `processIntegrationSync`, which also
      serves untracked models like remediations and must skip provenance for them. Replace its
      own `lastSynced = new Date()` with a required `observedAt` parameter, used for `lastSynced` and for every
      item's observation. Callers pass the same value for that sync's `TOMBSTONE`s
- [ ] In `processAssetIntegrationSync`, leave out the device fields when `device` is missing, like `assets.update`
      does. Test that a missing `device` keeps the asset's device, and that an explicit null clears it
- [ ] Route asset writes: `assets.create`, `createBulk`, `update`, `remove`, `enrichAssetIdentifiers`
- [ ] Route work order writes: tracking routers, `reschedule.ts`, `asset-tickets.ts`, mitigation
      routers, `work-orders/submit.ts`, `work-order-tools.ts`, `process-inbox-email`
- [ ] Route CSV imports (`csv-upload/import/apply.ts`) with the uploader as the actor and
      `CsvImport.createdAt` as `observedAt` for every row of every chunk. The observation holds the whole row,
      and only the fields missing from a matched device may be applied. Test that the rows of one import share
      one `observedAt`
- [ ] Write a `TOMBSTONE` for each ticket `deletePulledWorkOrders` deletes, including asset sub-tickets
- [ ] Promote drafts with `createWithObservation` (`approveWorkOrder`, `mitigation.accept`), one call per
      ticket, also for asset sub-tickets. `mitigation.accept` must promote before it applies the person's edits, so the edits
      are a `MANUAL` `PATCH`
- [ ] Leave `mitigation/persist.ts` without provenance: it only creates drafts, and only deletes ones that
      were never promoted. Its draft deletion uses `deleteDrafts`. Its nested draft creates need nothing, because
      the types don't block nested writes
- [ ] Route notification writes: `inbox/pipeline.ts`, `triage/persist.ts`, the inbox router,
      `analyze-remediation.ts`
- [ ] Set `sourceRecordId` on observations for notifications and emailed work orders
- [ ] Callers using `updateMany` must read the affected rows first to know the old values
- [ ] Return the PATCH response from `pushEditToPlatforms` and record it as the integration's `SNAPSHOT`
- [ ] Keep the behavior of `fleetCreatedEquipmentKeys`, reading who created the asset from its `CREATE`
      observation, since `Asset.userId` is gone
- [ ] Make demo seeds write through `createWithObservation` and `applyObservation`, or their rows have no
      provenance after the reset
- [ ] Add the raw SQL CHECK constraint on `Observation`
- [ ] Add the narrowed client types to `db.ts`, `asRaw` in `db-raw.ts`, and the Biome rule. Check that the types
      inferred from `ExtendedPrismaClient["asset"]` don't change
- [ ] `processIntegrationSync` takes an entity type instead of a delegate for tracked models. Remove the `any`
      clients from that path
- [ ] Add `updateIgnoredFields` and `deleteDrafts`. Test that `updateIgnoredFields` rejects a `tracked` field at
      runtime, and that `deleteDrafts` doesn't delete a ticket that isn't a draft
- [ ] Narrow each model in the PR that routes its last write. Add type tests with `@ts-expect-error` for each one:
      a write on `prisma`, on `tx` and through a dynamic model name, a delegate passed as a value, and
      `updateIgnoredFields` with a `tracked` field once it exists
- [ ] Use `asRaw` in the tests and `scripts/` that write tracked models directly
- [ ] Route the notification delete in `dev/fleet-integration.ts` too. The seeds in `prisma/seeds/` have no lint
      override

### work orders and SourceRecord

- [ ] Remove `recordWorkOrderSources` and the `ExternalSourceRecordMapping` rows it creates. Fold
      `WorkOrderSourceItem` into `PulledWorkOrder`, whose `raw` now goes to `applyObservation`
- [ ] Remove `source` from `integrationWorkOrderInputSchema`, and the `SourceRecord` that
      `workOrders.integrationUpload` creates from it
- [ ] Update `dev/work-orders.ts`, so only emailed demo tickets have a `SourceRecord`

### removing shadow users

- [x] Replace `createUserToken` and `consumeUserToken` with integration versions, and update `purgeExpiredTokens`
- [x] `createCallback` takes an `integrationId`
- [ ] `processIntegrationToken` returns only `integrationId`
- [ ] Remove `integrationUserId` from `ResourceSyncCtx`, and the `userId` parameter from
      `processIntegrationSync` and `transformInputItem`
- [ ] Drop `Integration.integrationUserId`, and make `Integration.userId` nullable
- [ ] Reset staging and local databases after PR 9, see "existing rows"
- [ ] Stop creating shadow users in `create-integration.ts`, and remove the name sync in the integrations router
- [ ] Update `csaf-integration.ts`, `dev/fleet-integration.ts`, `create-blueflow-integration.ts`,
      `seed-csaf-advisories.ts`
- [ ] Handle null `creatorId` in `asset-tickets.ts`, `interruptions.ts`, `tracking/types.ts`, tracking
      `columns.tsx` and `overview-card.tsx`
- [ ] Show the source name when the owner is null: remediation and device artifact columns,
      `remediations.tsx`, `vulnerabilities/utils.ts`, `vulnerability-drawer.tsx`
- [ ] In `recordCreationActivity`, return early when `creatorId` is null, because `TicketActivity.userId` is required
- [ ] Change `isAutomationActor` in `activity-timeline.tsx`, which checks for a shadow user, to compare with
      `AUTOMATION_USER_ID`. Replace that with `source = AUTOMATION` when the ticket timeline switches to
      `FieldChange`, and do the same for `isAgent` in the inbox router when the notification timeline does
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
      rows into one entry. An `INTEGRATION` observation shows its `integrationName`. Others show
      `observation.actor`, or "Deleted user" if it is null
- [ ] Remove `recordUpdateActivities`, `snapshotBeforeUpdate`, `recordCreationActivity` and the
      other writers in `activities.ts`
- [ ] Move the `cause` in `data` to `FieldChange.reason`
- [ ] Read `advisoryTitle` and `displayId` live rather than from the `WORK_ORDER_CREATED` snapshot
- [ ] Update `overview/server/routers.ts`, which reads status changes and joins through the
      ticket relation (`isDraft`, `summary`). This becomes a second query
- [ ] Drop both tables without migrating their rows
- [ ] Remove `recordFieldCorrections`; update `inbox/server/routers.ts` and
      `notification-activity-timeline.tsx`
- [ ] Update `dev/work-orders.ts` and `seed-recent-changes.ts`
- [ ] Decide how synced changes appear in the timeline. Sync records only a creation entry today, so
      field changes from integrations would be new there

### API and docs

- [ ] `/api/v1` breaking changes to list in the PR: `user` and `userId` removed from assets; nullable `user`
      and `userId` on remediations, device artifacts and artifacts; nullable `creator`; `activities` on
      tickets; `source` on the work order `integrationUpload` input; a missing `device` on the asset
      `integrationUpload` input no longer clears an existing asset's device
- [ ] Update `CLAUDE.md` (key models, background jobs, how to write tracked models, and no nested writes to them), `src/features/integrations/CLAUDE.md`, and the shadow user comments in `vulnerability-schema.md`

## Out of scope

* **Field reconciliation:** source precedence, protecting manual edits, and flagging conflicts. A user's
  edit is overwritten as soon as a source changes that field. Observations keep what every source said,
  so this can be added later without a schema change.
* **AI writes through tRPC:** `query_platform_data` is read-only today. If the chat agent can call mutations
  later, `createAgentCaller` must mark its context (like `auth.agent: true`), and the source helper must map
  that to `AUTOMATION` with the user it acted for. Without the mark the write would be `MANUAL`, because
  `createAgentCaller` passes a user and no API key, so it looks like a UI session. An optional
  `AUTOMATION` detail (agent, chat thread) could be added then too.
* **`raw` retention:** payloads are kept forever during alpha.
* **`raw` for assets:** only integration work orders store it for now.
* **`Remediation` and `DeviceArtifact`:** no provenance tracking for now.
* **`Vulnerability` and `VulnerabilityRecord`:** multiple records already say which source claimed what,
  and the only source-written `Vulnerability` field that changes after creation is `description`. Past
  values of a record aren't kept, as today. For CVSS history later, store metrics in `Observation.fields`
  and compare observations: `Metric` rows are deleted and recreated on update, and EPSS can change nightly.
* **`Issue`:** verdicts have no external sources, so they aren't part of this work. Nothing records who
  marked an issue `NOT_AFFECTED`, which is worth solving separately as an audit feature.

