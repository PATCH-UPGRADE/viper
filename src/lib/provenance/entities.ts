import "server-only";
import type { ProvenanceEntityType } from "@/generated/prisma";
import { type AssetInput, assetEntity } from "./asset";
import type { EntityDefinition, FieldWithMark } from "./types";
import { type WorkOrderInput, workOrderEntity } from "./work-order";

// TODO VW-605 (PR 9): NOTIFICATION gets its field map. Then every
// ProvenanceEntityType has one, and the Partial goes.
export const ENTITIES = {
  ASSET: assetEntity,
  WORK_ORDER: workOrderEntity,
} as const satisfies Partial<
  // biome-ignore lint/suspicious/noExplicitAny: each entity is for its own model
  Record<ProvenanceEntityType, EntityDefinition<any>>
>;

export type TrackedEntityType = keyof typeof ENTITIES;

/** What a write states about an entity. */
export interface EntityInputs {
  ASSET: AssetInput;
  WORK_ORDER: WorkOrderInput;
}

type Definition<E extends TrackedEntityType> = (typeof ENTITIES)[E];
type Groups<E extends TrackedEntityType> = Definition<E>["groups"];
type GroupedField<E extends TrackedEntityType> = {
  [G in keyof Groups<E>]: Groups<E>[G] extends readonly (infer Field)[]
    ? Field
    : never;
}[keyof Groups<E>];

/**
 * What a write path can be allowed to apply: a field, or a whole field group.
 * A field in a group can't be named alone.
 */
export type ApplyUnit<E extends TrackedEntityType> = E extends TrackedEntityType
  ? Extract<
      | keyof Groups<E>
      | Exclude<
          FieldWithMark<Definition<E>["fields"], "tracked">,
          GroupedField<E>
        >,
      string
    >
  : never;
