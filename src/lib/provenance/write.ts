import "server-only";
import { type ObservationKind, Prisma } from "@/generated/prisma";
import type { RawTransactionClient } from "@/lib/db";
import { asRaw } from "@/lib/db-raw";
import { requireExistence } from "@/trpc/middleware";
import {
  type ApplyUnit,
  ENTITIES,
  type EntityInputs,
  type TrackedEntityType,
} from "./entities";
import type {
  IntegrationOrigin,
  ObservationOrigin,
  ProvenanceTransaction,
} from "./types";
import {
  type AnyEntityDefinition,
  changedFields,
  fromStored,
  pick,
  rowValues,
  splitInput,
  storedForm,
  type Values,
} from "./values";

/**
 * The only way to create, update or delete a tracked entity. Each function
 * writes the golden record and its history in the caller's transaction.
 */

interface WriteParams {
  entityType: TrackedEntityType;
  entityId: string;
  origin: ObservationOrigin;
  sourceRecordId?: string;
  reason?: string;
}

export type ApplyObservationParams<E extends TrackedEntityType> = {
  entityType: E;
  entityId: string;
  /** Everything the source said, even what this write path may not apply. */
  fields: EntityInputs[E];
  /** The fields and field groups that may be applied. Defaults to all. */
  apply?: readonly ApplyUnit<E>[];
  /**
   * The value to write for an applied field, where it isn't the stated one: a
   * location whose stated parts are merged into the one the asset has.
   */
  applyAs?: EntityInputs[E];
  /** The document this came from, when a SourceRecord holds it. */
  sourceRecordId?: string;
  /** Why the fields changed. Stored on each FieldChange. */
  reason?: string;
} & (
  | { kind: "SNAPSHOT"; origin: IntegrationOrigin }
  | { kind: "PATCH"; origin: ObservationOrigin }
);

/**
 * Records what a source said about an entity, and applies what changed.
 *
 * A SNAPSHOT is compared to what the same integration said last, so a stale
 * source that repeats itself doesn't overwrite a newer value. A PATCH is
 * compared to the golden record.
 */
export async function applyObservation<E extends TrackedEntityType>(
  tx: ProvenanceTransaction,
  params: ApplyObservationParams<E>,
): Promise<void> {
  const write = startWrite(tx, params);
  const { def } = write;
  const { stated, ignored } = splitInput(def, { ...params.fields });
  const golden = await lockAndRead(write);

  const previous =
    params.kind === "SNAPSHOT"
      ? await lastStated(write, params.origin)
      : golden;
  const changed = changedFields(previous ?? {}, stated);

  const isDuplicate =
    params.kind === "SNAPSHOT"
      ? previous !== null &&
        changed.length === 0 &&
        Object.keys(previous).length === Object.keys(stated).length
      : changed.length === 0;
  if (isDuplicate) {
    await updateGolden(write, ignored);
    return;
  }

  const applyAs = splitInput(def, { ...params.applyAs }).stated;
  const applied = pick(
    { ...stated, ...applyAs },
    fieldsToApply(def, stated, changed, params.apply),
  );
  const delta = pick(applied, changedFields(golden, applied));

  const observationId = await insertObservation(
    write,
    params.kind,
    params.kind === "SNAPSHOT" ? stated : pick(stated, changed),
  );
  await updateGolden(write, { ...delta, ...ignored });
  await insertFieldChanges(write, observationId, golden, delta);
}

/**
 * Creates an entity and its CREATE observation. `create` writes the row, and
 * `fields` is what the source stated about it: each field it set to a value
 * gets a FieldChange. Ignored fields in `fields` are left out of the history,
 * so `create` has to write them too.
 */
export async function createWithObservation<
  E extends TrackedEntityType,
  Row extends { id: string },
>(
  tx: ProvenanceTransaction,
  params: {
    entityType: E;
    fields: EntityInputs[E];
    origin: ObservationOrigin;
    sourceRecordId?: string;
    reason?: string;
  },
  create: (raw: RawTransactionClient) => Promise<Row>,
): Promise<Row> {
  const row = await create(asRaw(tx));

  const write = startWrite(tx, { ...params, entityId: row.id });
  const { stated } = splitInput(write.def, { ...params.fields });
  const golden = await readGolden(write);
  const set = Object.keys(stated).filter((field) => golden[field] !== null);

  const observationId = await insertObservation(write, "CREATE", stated);
  await insertFieldChanges(write, observationId, {}, pick(golden, set));
  return row;
}

/** Deletes an entity and writes its TOMBSTONE. Its history stays. */
export async function deleteWithObservation<E extends TrackedEntityType, Row>(
  tx: ProvenanceTransaction,
  params: {
    entityType: E;
    entityId: string;
    origin: ObservationOrigin;
    sourceRecordId?: string;
  },
  remove: (raw: RawTransactionClient) => Promise<Row>,
): Promise<Row> {
  const write = startWrite(tx, params);
  await write.def.lockForDelete(tx, params.entityId);
  await readGolden(write);
  await insertObservation(write, "TOMBSTONE", {});
  return remove(asRaw(tx));
}

/** One write to one entity: its params, and what they resolve to. */
type Write = WriteParams & {
  tx: ProvenanceTransaction;
  def: AnyEntityDefinition;
  stored: ReturnType<typeof storedForm>;
};

function startWrite(tx: ProvenanceTransaction, params: WriteParams): Write {
  const def: AnyEntityDefinition = ENTITIES[params.entityType];
  const { entityType, entityId, origin, sourceRecordId, reason } = params;
  return {
    entityType,
    entityId,
    origin,
    sourceRecordId,
    reason,
    tx,
    def,
    stored: storedForm(def, tx),
  };
}

async function readGolden({ def, tx, entityId }: Write): Promise<Values> {
  const row = requireExistence(await def.read(tx, entityId), def.model);
  return rowValues(def, row);
}

/** Lock first, so two writers can't compare against the same old values. */
async function lockAndRead(write: Write): Promise<Values> {
  await write.def.lock(write.tx, write.entityId);
  return readGolden(write);
}

/** What an integration said last about the entity, or null if it never did. */
async function lastStated(
  { def, tx, entityType, entityId }: Write,
  { source, integrationId }: IntegrationOrigin,
): Promise<Values | null> {
  const last = await tx.observation.findFirst({
    where: {
      entityType,
      entityId,
      source,
      integrationId,
      kind: { in: ["CREATE", "SNAPSHOT"] },
    },
    orderBy: { seq: "desc" },
    select: { fields: true },
  });
  return last ? fromStored(def, last.fields) : null;
}

/**
 * The stated fields to apply: each changed one that this write path may apply,
 * with the rest of its field group.
 */
function fieldsToApply(
  def: AnyEntityDefinition,
  stated: Values,
  changed: string[],
  apply: readonly string[] | undefined,
): string[] {
  const unitOf = (field: string) =>
    Object.keys(def.groups).find((group) =>
      def.groups[group].includes(field),
    ) ?? field;

  const changedUnits = new Set(changed.map(unitOf));
  return Object.keys(stated).filter((field) => {
    const unit = unitOf(field);
    return changedUnits.has(unit) && (!apply || apply.includes(unit));
  });
}

async function updateGolden(
  { def, tx, entityId }: Write,
  data: Record<string, unknown>,
): Promise<void> {
  // An update without data would still bump updatedAt.
  if (Object.keys(data).length === 0) return;
  const columns = Object.entries(data).map(([field, value]) => [
    field,
    value === null && def.jsonFields.includes(field) ? Prisma.DbNull : value,
  ]);
  await def.update(tx, entityId, Object.fromEntries(columns));
}

async function insertObservation(
  { tx, entityType, entityId, origin, sourceRecordId, stored }: Write,
  kind: ObservationKind,
  fields: Values,
): Promise<string> {
  const { id } = await tx.observation.create({
    data: {
      entityType,
      entityId,
      kind,
      source: origin.source,
      ...(origin.source === "INTEGRATION" && {
        integrationId: origin.integrationId,
        integrationName: origin.integrationName,
      }),
      actorUserId: origin.actorUserId,
      observedAt: origin.observedAt,
      sourceRecordId,
      fields: await stored.ofAll(fields),
    },
    select: { id: true },
  });
  return id;
}

async function insertFieldChanges(
  { tx, entityType, entityId, reason, stored }: Write,
  observationId: string,
  before: Values,
  after: Values,
): Promise<void> {
  if (Object.keys(after).length === 0) return;
  const toColumn = async (field: string, value: Prisma.JsonValue) =>
    (await stored.of(field, value)) ?? Prisma.DbNull;

  const data: Prisma.FieldChangeCreateManyInput[] = [];
  for (const [field, value] of Object.entries(after)) {
    data.push({
      entityType,
      entityId,
      field,
      oldValue: await toColumn(field, before[field] ?? null),
      newValue: await toColumn(field, value),
      reason,
      observationId,
    });
  }
  await tx.fieldChange.createMany({ data });
}
