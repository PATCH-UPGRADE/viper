// Central helper for resolving which Notes are relevant to a given scope.
//
// A Note is relevant either because its status is PERSISTENT (always applies)
// or because it directly references an in-scope entity via targetModel +
// instanceId. This mirrors the inline query the VEX context used to run, and is
// the single place note relevance should be computed.
//
// This is intentionally a MINIMAL implementation. Two future relevance sources
// are stubbed out with TODOs below and not yet wired up:
//   1. EntityFilterMatch — notes attached via an EntityFilter, matched to
//      concrete entities by a future Inngest job that memoizes matches.
//   2. Device-group-matching resolution — a note on a DeviceGroupMatching whose
//      vendor/product/versionRange matches an asset's device group (e.g. a
//      "vers:all/*" range matching every version of a product).

import "server-only";
import type { NoteStatus, ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";

/** The projection of a Note returned by the relevance helpers. */
export type RelevantNote = {
  text: string;
  status: NoteStatus;
  targetModel: ScopeTargetModel | null;
  instanceId: string | null;
};

/**
 * In-scope entity ids, grouped by the model they belong to. Any omitted or
 * empty list simply contributes no direct references.
 */
export type NoteScope = {
  vulnerabilityIds?: string[];
  remediationIds?: string[];
  deviceGroupIds?: string[];
  deviceGroupMatchingIds?: string[];
  assetIds?: string[];
};

const NOTE_SELECT = {
  text: true,
  status: true,
  targetModel: true,
  instanceId: true,
} as const;

/**
 * All notes relevant to the given scope: every PERSISTENT note plus any note
 * whose targetModel/instanceId points at one of the supplied ids.
 */
export async function getRelevantNotes(
  scope: NoteScope,
): Promise<RelevantNote[]> {
  const direct: Array<{ targetModel: ScopeTargetModel; ids: string[] }> = [
    { targetModel: "VULNERABILITY", ids: scope.vulnerabilityIds ?? [] },
    { targetModel: "REMEDIATION", ids: scope.remediationIds ?? [] },
    { targetModel: "DEVICE_GROUP", ids: scope.deviceGroupIds ?? [] },
    {
      targetModel: "DEVICE_GROUP_MATCHING",
      ids: scope.deviceGroupMatchingIds ?? [],
    },
    { targetModel: "ASSET", ids: scope.assetIds ?? [] },
  ];

  const or: Array<{
    status?: NoteStatus;
    targetModel?: ScopeTargetModel;
    instanceId?: { in: string[] };
  }> = [{ status: "PERSISTENT" }];

  for (const { targetModel, ids } of direct) {
    if (ids.length > 0) or.push({ targetModel, instanceId: { in: ids } });
  }

  // TODO(EntityFilterMatch): once a background job populates EntityFilterMatch
  // from EntityFilter, also include notes reachable via
  // EntityFilterMatch.targetId ∈ scope ids → EntityFilter.noteId (scoped by
  // EntityFilter.targetModel). Not implemented yet, so filter-based notes are
  // not returned today.

  return prisma.note.findMany({ where: { OR: or }, select: NOTE_SELECT });
}

/**
 * All notes relevant to a single asset: notes attached directly to the asset,
 * notes attached to its device group, and all PERSISTENT notes.
 */
export async function getNotesForAsset(
  assetId: string,
): Promise<RelevantNote[]> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { deviceGroupId: true },
  });

  // TODO(device-group-matching): also include notes on DeviceGroupMatchings
  // that apply to this asset's device group. Resolve candidates with
  // matchingWhereForDeviceGroup + matchingAppliesToDeviceGroup from
  // @/lib/device-matching, then pass their ids as deviceGroupMatchingIds.

  return getRelevantNotes({
    assetIds: [assetId],
    deviceGroupIds: asset ? [asset.deviceGroupId] : [],
  });
}

/**
 * All notes relevant to a single device group: notes attached directly to the
 * group, plus all PERSISTENT notes.
 */
export async function getNotesForDeviceGroup(
  deviceGroupId: string,
): Promise<RelevantNote[]> {
  // TODO(device-group-matching): also include notes on DeviceGroupMatchings
  // that apply to this device group (see matchingWhereForDeviceGroup +
  // matchingAppliesToDeviceGroup in @/lib/device-matching).

  return getRelevantNotes({ deviceGroupIds: [deviceGroupId] });
}
