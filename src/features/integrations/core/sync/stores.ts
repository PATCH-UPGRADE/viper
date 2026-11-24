import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma, {
  type RawTransactionClient,
  type TransactionClient,
} from "@/lib/db";
import { assetColumns } from "@/lib/provenance/asset";
import {
  type ApplyUnit,
  ENTITIES,
  type EntityInputs,
  type TrackedEntityType,
} from "@/lib/provenance/entities";
import type { IntegrationOrigin } from "@/lib/provenance/types";
import {
  applyObservation,
  createWithObservation,
} from "@/lib/provenance/write";
import { requireExistence } from "@/trpc/middleware";

/** A mapping row, without the item it points at. */
export interface MappingData {
  integrationId: string;
  externalId: string;
  lastSynced: Date;
  upstreamApi: string | null;
  webUrl: string | null;
}

interface MappingRef {
  id: string;
  itemId: string;
}

/** How a sync reads and writes one kind of item and its mappings. */
export interface SyncStore<TWrite> {
  findMapping(
    integrationId: string,
    externalId: string,
  ): Promise<MappingRef | null>;
  /** An item that the same properties identify. */
  findItem(write: TWrite): Promise<{ id: string } | null>;
  create(write: TWrite, mapping: MappingData): Promise<{ id: string }>;
  update(write: TWrite, ref: MappingRef, mapping: MappingData): Promise<void>;
  /** Maps an existing item, and updates it. */
  link(write: TWrite, itemId: string, mapping: MappingData): Promise<void>;
}

const syncFields = ({ lastSynced, upstreamApi, webUrl }: MappingData) => ({
  lastSynced,
  upstreamApi,
  webUrl,
});

// biome-ignore-start lint/suspicious/noExplicitAny: the delegate of any untracked model
interface Delegate {
  findFirst: (args: any) => any;
  create: (args: any) => any;
  update: (args: any) => any;
}

export interface UntrackedTarget {
  model: Delegate;
  mappingModel: Delegate;
  // The relation on `model` that holds its mapping. Most items can be known by
  // several integrations (`externalMappings`); a work order has at most one
  // (`externalMapping`). The model delegates are untyped, so a wrong name only
  // fails at runtime.
  mappingRelation?: "externalMappings" | "externalMapping";
}

export interface UntrackedWrite {
  createData: Record<string, any>;
  updateData: Record<string, any>;
  uniqueFieldConditions: Array<Record<string, any>>;
}
// biome-ignore-end lint/suspicious/noExplicitAny: the delegate of any untracked model

export const untrackedStore = ({
  model,
  mappingModel,
  mappingRelation = "externalMappings",
}: UntrackedTarget): SyncStore<UntrackedWrite> => ({
  findMapping: (integrationId, externalId) =>
    mappingModel.findFirst({
      where: { integrationId, externalId },
      select: { id: true, itemId: true },
    }),
  findItem: async ({ uniqueFieldConditions }) =>
    uniqueFieldConditions.length > 0
      ? model.findFirst({ where: { OR: uniqueFieldConditions } })
      : null,
  create: ({ createData }, mapping) =>
    model.create({
      data: { ...createData, [mappingRelation]: { create: mapping } },
    }),
  update: async ({ updateData }, { id, itemId }, mapping) => {
    await prisma.$transaction([
      mappingModel.update({ where: { id }, data: syncFields(mapping) }),
      model.update({ where: { id: itemId }, data: updateData }),
    ]);
  },
  link: async ({ updateData }, itemId, mapping) => {
    await prisma.$transaction([
      mappingModel.create({ data: { itemId, ...mapping } }),
      model.update({ where: { id: itemId }, data: updateData }),
    ]);
  },
});

/** The columns of a new row that a source doesn't state. */
interface CreateOnly {
  // TODO VW-605 (PR 5): `userId` goes, with the column.
  ASSET: Pick<Prisma.AssetUncheckedCreateInput, "id" | "userId">;
}

interface ItemWhere {
  ASSET: Prisma.AssetWhereInput;
}

export interface TrackedWrite<E extends TrackedEntityType> {
  /** What the item states when it is new. Null if it may not create one. */
  create: { fields: EntityInputs[E]; only: CreateOnly[E] } | null;
  /** What the item states about an existing one, and what may be applied. */
  update: {
    fields: EntityInputs[E];
    apply?: readonly ApplyUnit<E>[];
    applyAs?: EntityInputs[E];
  };
  uniqueFieldConditions: ItemWhere[E][];
}

interface TrackedModel<E extends TrackedEntityType> {
  findMapping: SyncStore<unknown>["findMapping"];
  findItem(conditions: ItemWhere[E][]): Promise<{ id: string } | null>;
  createItem(
    raw: RawTransactionClient,
    write: NonNullable<TrackedWrite<E>["create"]>,
    mapping: MappingData,
  ): Promise<{ id: string }>;
  createMapping(
    tx: TransactionClient,
    itemId: string,
    mapping: MappingData,
  ): Promise<unknown>;
  updateMapping(
    tx: TransactionClient,
    id: string,
    mapping: ReturnType<typeof syncFields>,
  ): Promise<unknown>;
}

const TRACKED_MODELS: { [E in TrackedEntityType]: TrackedModel<E> } = {
  ASSET: {
    findMapping: (integrationId, externalId) =>
      prisma.externalAssetMapping.findFirst({
        where: { integrationId, externalId },
        select: { id: true, itemId: true },
      }),
    findItem: (OR) =>
      prisma.asset.findFirst({ where: { OR }, select: { id: true } }),
    createItem: (raw, { fields, only }, mapping) =>
      raw.asset.create({
        data: {
          ...assetColumns(fields),
          ...only,
          externalMappings: { create: mapping },
        },
        select: { id: true },
      }),
    createMapping: (tx, itemId, mapping) =>
      tx.externalAssetMapping.create({ data: { itemId, ...mapping } }),
    updateMapping: (tx, id, data) =>
      tx.externalAssetMapping.update({ where: { id }, data }),
  },
};

/**
 * Writes through the provenance functions. Each update is a SNAPSHOT. It comes
 * before the mapping write, because it locks the item: a delete also locks the
 * item before its mappings, so the other order would deadlock with it.
 */
export function trackedStore<E extends TrackedEntityType>(
  entityType: E,
  origin: IntegrationOrigin,
): SyncStore<TrackedWrite<E>> {
  const model: TrackedModel<E> = TRACKED_MODELS[entityType];

  const snapshot = (
    tx: TransactionClient,
    entityId: string,
    { update }: TrackedWrite<E>,
  ) =>
    applyObservation(tx, {
      entityType,
      entityId,
      kind: "SNAPSHOT",
      origin,
      ...update,
    });

  return {
    findMapping: model.findMapping,
    findItem: async ({ uniqueFieldConditions }) =>
      uniqueFieldConditions.length > 0
        ? model.findItem(uniqueFieldConditions)
        : null,
    create: async (write, mapping) => {
      const create = requireExistence(write.create, ENTITIES[entityType].model);
      return prisma.$transaction((tx) =>
        createWithObservation(
          tx,
          { entityType, fields: create.fields, origin },
          (raw) => model.createItem(raw, create, mapping),
        ),
      );
    },
    update: (write, { id, itemId }, mapping) =>
      prisma.$transaction(async (tx) => {
        await snapshot(tx, itemId, write);
        await model.updateMapping(tx, id, syncFields(mapping));
      }),
    link: (write, itemId, mapping) =>
      prisma.$transaction(async (tx) => {
        await snapshot(tx, itemId, write);
        await model.createMapping(tx, itemId, mapping);
      }),
  };
}
