import type { Prisma } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";

// ============================================================================
// Origin
// ============================================================================

export type IntegrationOrigin = {
  source: "INTEGRATION";
  integrationId: string;
  integrationName: string;
  /** One value for a whole sync, so its observations can be found together. */
  observedAt: Date;
  actorUserId?: string;
};

/** Where a write came from. See "what source a write has" in docs/provenance-schema.md. */
export type ObservationOrigin =
  | IntegrationOrigin
  | {
      source: "MANUAL" | "API_CLIENT" | "AUTOMATION" | "EMAIL";
      actorUserId: string;
      observedAt?: Date; // defaults to now
    };

// ============================================================================
// Transaction
// ============================================================================

/**
 * A transaction, and not the client itself. A row lock ends with its
 * transaction, so outside of one it would protect nothing.
 */
export type ProvenanceTransaction = TransactionClient & {
  $transaction?: never;
};

// ============================================================================
// Field maps
// ============================================================================

/**
 * - `tracked`: a fact that a source or person asserted. Changing it writes a
 *   FieldChange.
 * - `ignored`: internal, computed, or not worth a history. It is left out of
 *   observations, and a write that includes it still saves it.
 */
export type FieldMark = "tracked" | "ignored";

type ModelPayload<M extends Prisma.ModelName> =
  Prisma.TypeMap["model"][M]["payload"];

export type ModelScalars<M extends Prisma.ModelName> =
  ModelPayload<M>["scalars"];

/** A mark for every column and relation of a model. */
export type FieldMap<M extends Prisma.ModelName> = Record<
  keyof ModelPayload<M>["scalars"] | keyof ModelPayload<M>["objects"],
  FieldMark
>;

export type FieldWithMark<F, Mark extends FieldMark> = {
  [K in keyof F]: F[K] extends Mark ? K : never;
}[keyof F];

/** What the write functions need to know about a tracked model. */
export interface EntityDefinition<M extends Prisma.ModelName> {
  model: M;
  fields: FieldMap<M>;
  /** Fields that are only valid together, so they are applied together. */
  groups: Record<string, readonly (keyof ModelScalars<M>)[]>;
  /** JSON columns, which Prisma clears with DbNull and not with null. */
  jsonFields: readonly (keyof ModelScalars<M>)[];
  /** Nullable text columns where "" means the same as null. */
  emptyIsNull: readonly (keyof ModelScalars<M>)[];
  /** For each foreign key field: the name of the row an id points at. */
  labels: {
    [K in keyof ModelScalars<M>]?: (
      tx: ProvenanceTransaction,
      id: string,
    ) => Promise<string | undefined>;
  };
  /** Locks the row until the transaction ends. */
  lock(tx: ProvenanceTransaction, id: string): Promise<unknown>;
  /** Reads at least the tracked columns. */
  read(
    tx: ProvenanceTransaction,
    id: string,
  ): Promise<Record<string, unknown> | null>;
  update(
    tx: ProvenanceTransaction,
    id: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
