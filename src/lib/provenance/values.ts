import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@/generated/prisma";
import type { EntityDefinition, ProvenanceTransaction } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: works for every tracked model
export type AnyEntityDefinition = EntityDefinition<any>;

/**
 * Tracked values by field name, normalized so that they can be compared. A
 * foreign key is its bare id here, and `{ id, label }` once stored.
 */
export type Values = Record<string, Prisma.JsonValue>;

/**
 * The value as JSON stores it: a Date becomes a string, a key that is
 * undefined goes away, and `""` becomes null in a field where they mean the
 * same.
 */
function normalizeValue(
  def: AnyEntityDefinition,
  field: string,
  value: unknown,
): Prisma.JsonValue {
  if (value === "" && def.emptyIsNull.includes(field)) return null;
  // Throws on an invalid Date, which JSON would turn into null.
  if (value instanceof Date) return value.toISOString();
  return JSON.parse(JSON.stringify(value ?? null));
}

export const trackedFields = (def: AnyEntityDefinition): string[] =>
  Object.keys(def.fields).filter((field) => def.fields[field] === "tracked");

/** The tracked values of a database row. */
export function rowValues(
  def: AnyEntityDefinition,
  row: Record<string, unknown>,
): Values {
  return Object.fromEntries(
    trackedFields(def).map((field) => [
      field,
      normalizeValue(def, field, row[field]),
    ]),
  );
}

/**
 * Split what a write states into normalized tracked values and raw ignored
 * ones. An undefined value is the same as a missing key. A spread can add a
 * field that the type doesn't have, so unknown fields throw.
 */
export function splitInput(
  def: AnyEntityDefinition,
  input: Record<string, unknown>,
): { stated: Values; ignored: Record<string, unknown> } {
  for (const field of Object.keys(input)) {
    if (!Object.hasOwn(def.fields, field)) {
      throw new Error(`${def.model} has no field "${field}"`);
    }
  }
  const stated: Values = {};
  const ignored: Record<string, unknown> = {};
  // In the map's order, so the FieldChanges of a write have a stable order.
  for (const [field, mark] of Object.entries(def.fields)) {
    const value = input[field];
    if (value === undefined) continue;
    if (mark === "tracked") stated[field] = normalizeValue(def, field, value);
    else ignored[field] = value;
  }
  return { stated, ignored };
}

/** The fields of `next` that `previous` doesn't have, or has with another value. */
export const changedFields = (previous: Values, next: Values): string[] =>
  Object.keys(next).filter(
    (field) =>
      !Object.hasOwn(previous, field) ||
      !isDeepStrictEqual(previous[field], next[field]),
  );

export const pick = (values: Values, fields: Iterable<string>): Values =>
  Object.fromEntries([...fields].map((field) => [field, values[field]]));

/** Stored `Observation.fields`, with each foreign key back to its bare id. */
export function fromStored(
  def: AnyEntityDefinition,
  stored: Prisma.JsonValue,
): Values {
  return Object.fromEntries(
    Object.entries(stored as Prisma.JsonObject).map(([field, value]) => [
      field,
      def.labels[field] && value !== null
        ? (value as { id: string }).id
        : (value ?? null),
    ]),
  );
}

/**
 * Stores values with each foreign key as `{ id, label }`, so that history
 * stays readable after the referenced row is deleted. Looks each label up once.
 */
export function storedForm(
  def: AnyEntityDefinition,
  tx: ProvenanceTransaction,
) {
  const labels = new Map<string, string>();

  const of = async (
    field: string,
    value: Prisma.JsonValue,
  ): Promise<Prisma.JsonValue> => {
    const findLabel = def.labels[field];
    if (!findLabel || value === null) return value;
    const id = value as string;
    const key = `${field}:${id}`;
    const label = labels.get(key) ?? (await findLabel(tx, id)) ?? id;
    labels.set(key, label);
    return { id, label };
  };

  const ofAll = async (values: Values): Promise<Prisma.InputJsonObject> => {
    const stored: Record<string, Prisma.JsonValue> = {};
    for (const [field, value] of Object.entries(values)) {
      stored[field] = await of(field, value);
    }
    return stored as Prisma.InputJsonObject;
  };

  return { of, ofAll };
}
