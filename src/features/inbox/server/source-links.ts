import "server-only";
import type {
  ConfidenceLevel,
  MatchFeedbackTargetType,
  Prisma,
} from "@/generated/prisma";
import prisma, { type TransactionClient } from "@/lib/db";
import { matchingIdentitySelect } from "@/lib/router-utils";
import {
  SOURCE_RECORD_MAPPING_KEYS,
  type SourceRecordMappingKind,
  type WithoutMappings,
} from "../types";

// What a notification is about lives on its source records. These helpers turn
// the per-record mapping rows into the one list a notification shows.

type Mapping = { confidence: ConfidenceLevel | null };

/**
 * One row per linked entity across every source record of a notification.
 *
 * A Rejected row on any record hides the entity from the whole notification,
 * so a later record that names the entity again does not revive it. Of the
 * rows that remain, the first one seen stands for the entity.
 */
export function collectMappings<M extends Mapping>(
  rows: M[],
  targetId: (row: M) => string,
): M[] {
  const rejected = new Set(
    rows.filter((row) => row.confidence === "Rejected").map(targetId),
  );
  const seen = new Set<string>();
  const out: M[] = [];
  for (const row of rows) {
    const key = targetId(row);
    if (rejected.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

type MappingRow<K extends SourceRecordMappingKind> = Mapping &
  Record<(typeof SOURCE_RECORD_MAPPING_KEYS)[K], string>;

/** The mappings of one kind that a notification shows, after rejections. */
export function linked<
  K extends SourceRecordMappingKind,
  L extends { sourceRecord: Record<K, MappingRow<K>[]> },
>(sourceLinks: L[], kind: K): L["sourceRecord"][K][number][] {
  const key = SOURCE_RECORD_MAPPING_KEYS[kind];
  const rows = sourceLinks.flatMap(
    (link) => link.sourceRecord[kind] as L["sourceRecord"][K][number][],
  );
  return collectMappings(rows, (row) => (row as MappingRow<K>)[key]);
}

/**
 * The links without their mapping rows, for a payload that already carries the
 * collapsed lists. Otherwise every mapping would travel twice.
 */
export function stripMappings<L extends { sourceRecord: object }>(
  sourceLinks: L[],
): WithoutMappings<L>[] {
  return sourceLinks.map(({ sourceRecord, ...link }) => {
    const rest: Record<string, unknown> = { ...sourceRecord };
    for (const kind of Object.keys(SOURCE_RECORD_MAPPING_KEYS)) {
      delete rest[kind];
    }
    return { ...link, sourceRecord: rest } as WithoutMappings<L>;
  });
}

/** A mapping row that sits on a record which feeds this notification. */
export const inNotification = (notificationId: string) => ({
  sourceRecord: { links: { some: { notificationId } } },
});

/** The matchings a notification names, with the identity that resolves them to assets. */
export const linkedMatchingIdentitySelect = {
  select: {
    sourceRecord: {
      select: {
        deviceGroupMatchings: {
          select: {
            deviceGroupMatchingId: true,
            confidence: true,
            deviceGroupMatching: { select: matchingIdentitySelect },
          },
        },
      },
    },
  },
} satisfies Prisma.Notification$sourceLinksArgs;

/** The vulnerabilities a notification is about, after rejections. */
export async function notificationVulnerabilityIds(
  notificationId: string,
): Promise<string[]> {
  const rows = await prisma.sourceRecordVulnerabilityMapping.findMany({
    where: inNotification(notificationId),
    select: { vulnerabilityId: true, confidence: true },
  });
  return collectMappings(rows, (row) => row.vulnerabilityId).map(
    (row) => row.vulnerabilityId,
  );
}

/**
 * Reject one entity on every source record of a notification.
 *
 * `targetId` names one mapping row. The same entity can sit on several records
 * of the notification, and a user who unlinks it means the notification, so
 * every row for that entity is rejected. Only device group and vulnerability
 * links can be unlinked; the other target types record feedback only.
 */
export async function rejectLinkedMapping(
  tx: TransactionClient,
  input: {
    targetType: MatchFeedbackTargetType;
    targetId: string;
    notificationId: string;
  },
): Promise<void> {
  const { targetType, targetId, notificationId } = input;
  const scope = inNotification(notificationId);
  const one = { id: targetId, ...scope };
  const data = { confidence: "Rejected" as const };

  if (targetType === "SourceRecordDeviceGroupMapping") {
    const row = await tx.sourceRecordDeviceGroupMapping.findFirstOrThrow({
      where: one,
      select: { deviceGroupMatchingId: true },
    });
    await tx.sourceRecordDeviceGroupMapping.updateMany({
      where: { deviceGroupMatchingId: row.deviceGroupMatchingId, ...scope },
      data,
    });
  } else if (targetType === "SourceRecordVulnerabilityMapping") {
    const row = await tx.sourceRecordVulnerabilityMapping.findFirstOrThrow({
      where: one,
      select: { vulnerabilityId: true },
    });
    await tx.sourceRecordVulnerabilityMapping.updateMany({
      where: { vulnerabilityId: row.vulnerabilityId, ...scope },
      data,
    });
  }
}
