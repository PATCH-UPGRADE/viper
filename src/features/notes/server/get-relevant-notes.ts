// Central helper for matching notes to VIPER models.
//
// A Note is relevant to an object either because it directly references that
// object via targetModel + instanceId, or via EntityFilterMatch

import "server-only";
import type { NoteStatus, ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { ScopedNote } from "../schemas";

/** The projection of a Note returned by the note helpers. */
export type RelevantNote = {
  id: string;
  text: string;
  status: NoteStatus;
  targetModel: ScopeTargetModel | null;
  instanceId: string | null;
};

const NOTE_SELECT = {
  id: true,
  text: true,
  status: true,
  targetModel: true,
  instanceId: true,
} as const;

/**
 * Attach each entity's SCOPED notes onto a batch of entities, keyed by id.
 * Used in paginated routers to add notes to returned items 
 */
export async function attachNotes<T extends { id: string }>(
  targetModel: ScopeTargetModel,
  items: T[],
): Promise<(T & { notes: ScopedNote[] })[]> {
  const byEntity = await getScopedNotesByInstance(
    targetModel,
    items.map((item) => item.id),
  );
  return items.map((item) => ({ ...item, notes: byEntity.get(item.id) ?? [] }));
}

/** Single-entity convenience wrapper around {@link attachNotes}. */
export async function attachNote<T extends { id: string }>(
  targetModel: ScopeTargetModel,
  item: T,
): Promise<T & { notes: ScopedNote[] }> {
  const [withNotes] = await attachNotes(targetModel, [item]);
  return withNotes;
}

/**
 * Notes matching one or more objects of a single targetModel, by id. Does not
 * include PERSISTENT notes (see getRelevantNotes for that).
 */
export async function getNotesForInstance(
  targetModel: ScopeTargetModel,
  ids: string[],
): Promise<RelevantNote[]> {
  if (ids.length === 0) return [];

  // A note is relevant to one of these ids either directly (targetModel +
  // instanceId) or because one of its EntityFilters resolved to a match on that
  // id. Matches are materialized by the resolve-entity-filters Inngest job.
  return prisma.note.findMany({
    where: {
      OR: [
        { targetModel, instanceId: { in: ids } },
        {
          filters: {
            some: {
              targetModel,
              matches: { some: { targetId: { in: ids } } },
            },
          },
        },
      ],
    },
    select: NOTE_SELECT,
  });
}

/**
 * SCOPED notes matching a batch of entity ids of one targetModel, grouped by the
 * entity id each note resolves to — directly (Note.instanceId) AND via
 * EntityFilterMatch.targetId. Excludes PERSISTENT notes. A note that matches an
 * entity both ways appears once for that entity.
 */
export async function getScopedNotesByInstance(
  targetModel: ScopeTargetModel,
  ids: string[],
): Promise<Map<string, ScopedNote[]>> {
  const byEntity = new Map<string, ScopedNote[]>();
  if (ids.length === 0) return byEntity;

  const idSet = new Set(ids);
  const notes = await prisma.note.findMany({
    where: {
      status: "SCOPED",
      OR: [
        { targetModel, instanceId: { in: ids } },
        {
          filters: {
            some: {
              targetModel,
              matches: { some: { targetId: { in: ids } } },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      text: true,
      instanceId: true,
      filters: {
        where: { targetModel },
        select: {
          matches: {
            where: { targetId: { in: ids } },
            select: { targetId: true },
          },
        },
      },
    },
  });

  const attach = (entityId: string, note: ScopedNote) => {
    const existing = byEntity.get(entityId);
    if (!existing) {
      byEntity.set(entityId, [note]);
    } else if (!existing.some((n) => n.id === note.id)) {
      existing.push(note);
    }
  };

  for (const note of notes) {
    const payload: ScopedNote = { id: note.id, text: note.text };
    // Direct match: instanceId is one of the requested ids.
    if (note.instanceId && idSet.has(note.instanceId)) {
      attach(note.instanceId, payload);
    }
    // Filter-resolved matches: each match's targetId is one of the requested ids.
    for (const filter of note.filters) {
      for (const match of filter.matches) {
        attach(match.targetId, payload);
      }
    }
  }

  return byEntity;
}

/**
 * Notes matching a single device group. Stubbed today: notes cannot attach to a
 * device group directly, only to device group matchings.
 */
export async function getNotesForDeviceGroup(
  _deviceGroupId: string,
): Promise<RelevantNote[]> {
  // TODO(device-group-matching): resolve the DeviceGroupMatchings that match
  // this device group (reuse matchingWhereForDeviceGroup +
  // matchingAppliesToDeviceGroup from @/lib/device-matching), then
  // `return getNotesForInstance("DEVICE_GROUP_MATCHING", matchingIds)`.
  return [];
}

/**
 * Notes matching a single asset. Today: notes attached directly to the asset.
 */
export async function getNotesForAsset(
  assetId: string,
): Promise<RelevantNote[]> {
  // TODO(device-group-matching): also include notes on the DeviceGroupMatching(s)
  // this asset's device group belongs to — look up asset.deviceGroupId and
  // delegate to getNotesForDeviceGroup.
  return getNotesForInstance("ASSET", [assetId]);
}

/**
 * In-scope entity ids, grouped by the model they belong to. Any omitted or
 * empty list simply contributes no references.
 */
export type NoteScope = {
  vulnerabilityIds?: string[];
  remediationIds?: string[];
  deviceGroupMatchingIds?: string[];
  assetIds?: string[];
};

/**
 * All notes relevant to the given scope: every PERSISTENT note plus any note
 * that matches one of the supplied entities. Deduped by note id.
 */
export async function getRelevantNotes(
  scope: NoteScope,
): Promise<RelevantNote[]> {
  const [persistent, vulnerabilities, remediations, matchings, assets] =
    await Promise.all([
      prisma.note.findMany({
        where: { status: "PERSISTENT" },
        select: NOTE_SELECT,
      }),
      getNotesForInstance("VULNERABILITY", scope.vulnerabilityIds ?? []),
      getNotesForInstance("REMEDIATION", scope.remediationIds ?? []),
      getNotesForInstance(
        "DEVICE_GROUP_MATCHING",
        scope.deviceGroupMatchingIds ?? [],
      ),
      getNotesForInstance("ASSET", scope.assetIds ?? []),
    ]);

  const byId = new Map<string, RelevantNote>();
  for (const note of [
    ...persistent,
    ...vulnerabilities,
    ...remediations,
    ...matchings,
    ...assets,
  ]) {
    byId.set(note.id, note);
  }
  return [...byId.values()];
}
