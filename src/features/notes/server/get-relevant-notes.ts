// Central helper for matching notes to VIPER models.
//
// A Note is relevant to an object either because it directly references that
// object via targetModel + instanceId, or via EntityFilterMatch

import "server-only";
import type { NoteStatus, ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";

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
 * Notes matching one or more objects of a single targetModel, by id. Does not
 * include PERSISTENT notes (see getRelevantNotes for that).
 */
export async function getNotesForInstance(
  targetModel: ScopeTargetModel,
  ids: string[],
): Promise<RelevantNote[]> {
  if (ids.length === 0) return [];

  // TODO(EntityFilterMatch): VW-358 -- also include notes that match
  // via EntityFilterMatch

  return prisma.note.findMany({
    where: { targetModel, instanceId: { in: ids } },
    select: NOTE_SELECT,
  });
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
      Promise.all((scope.assetIds ?? []).map(getNotesForAsset)).then(
        (results) => results.flat(),
      ),
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
