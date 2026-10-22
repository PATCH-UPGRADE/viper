import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchUtilizationGrids } from "@/features/assets/server/utilization";
import {
  IssueStatus,
  MatchFeedbackTargetType,
  NotificationType,
  Priority,
  type Prisma,
} from "@/generated/prisma";
import { requestNoteAction } from "@/inngest/functions/notes-action";
import { AUTOMATION_USER_ID } from "@/lib/automation-user";
import prisma from "@/lib/db";
import {
  deviceIdentitySelect,
  matchingAppliesToDevice,
  unknownVersionAssetWhere,
} from "@/lib/device-matching";
import { recordFieldCorrections } from "@/lib/field-correction";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  assetWhereForMatchings,
  buildUpdatedAtFilter,
  resolvedAssetCount,
} from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  fieldCorrectionInclude,
  type MatchingWithLabels,
  notificationDetailInclude,
  notificationInclude,
  notRejected,
  type ResolvedDeviceGroupAsset,
  readReceiptSelect,
} from "../types";
import {
  AFFECTED_BUCKETS,
  bucketForStatus,
  buildAffectedAssetsSummary,
  computeMatchingBuckets,
  type MatchingBucketGroup,
} from "./affected-assets";

type MatchingIdentity = {
  manufacturerId: string;
  productId: string | null;
  versionId: string | null;
  versionRange: string | null;
};

/**
 * Per-matching inputs needed to bucket its assets: the matching-level Issue
 * status per vuln, the asset-level override Issues that belong to this matching,
 * and whether it is linked to the notification.
 */
type AffectedMatchingContext = {
  matchingId: string;
  mappingId: string | null;
  deviceGroupMatching: MatchingWithLabels;
  matchingStatusByVuln: Record<string, IssueStatus>;
  matchingNotesByVuln: Record<string, string>; // issue statusNotes
  overrides: {
    assetId: string;
    statusByVuln: Record<string, IssueStatus>;
    notesByVuln: Record<string, string>; // issue statusNotes
  }[];
  isNotificationLinked: boolean;
  // ^true if \exists NotificationDeviceGroupMapping n s.t n.dgm.id=am.id
};

export const NOTIFICATION_SORT_FIELDS = new Set([
  "priority",
  "updatedAt",
  "createdAt",
]);

function getSortValue(segment: string): "asc" | "desc" {
  return segment.startsWith("-") ? "desc" : "asc";
}

const createSearchFilter = (search: string) => {
  if (!search) return {};
  const insensitive = { contains: search, mode: "insensitive" as const };
  return {
    OR: [{ title: insensitive }, { summary: insensitive }],
  };
};

async function unknownVersionAssetCount(
  matching: MatchingIdentity,
): Promise<number> {
  const where = unknownVersionAssetWhere(matching);
  if (!where) return 0;
  return prisma.asset.count({ where });
}

/**
 * Get all non-Fixed Issues that are associated with vulnerabilities from this notification
 * Sort issues into DGM issues, and asset issues
 * Build displayMatchings, DGM's that are linked to notification union DGM's found via issues
 * statusByMatching links {DGM.id -> {vuln.id -> status}}
 * Get all DGM's of the Issue assets to know where to exclude them
 */
async function buildMatchingContexts(
  notifMatchings: { id: string; deviceGroupMatching: MatchingWithLabels }[],
  vulnIds: string[],
): Promise<AffectedMatchingContext[]> {
  const issues =
    vulnIds.length === 0
      ? []
      : await prisma.issue.findMany({
          where: {
            vulnerabilityId: { in: vulnIds },
          },
          select: {
            vulnerabilityId: true,
            deviceGroupMatchingId: true,
            assetId: true,
            status: true,
            statusNotes: true,
          },
        });

  // Matching-level FIXED issues are dropped here (bucketing assumes FIXED is
  // filtered upstream); asset-level FIXED overrides are kept so a fixed asset
  // is excluded from its matching's default bucket.
  const matchingLevelIssues = issues.filter(
    (i) =>
      i.assetId === null &&
      i.deviceGroupMatchingId !== null &&
      i.status !== IssueStatus.FIXED,
  );
  const assetLevelIssues = issues.filter((i) => i.assetId !== null);

  // Display matchings: notification-linked `union` issue-referenced.
  const displayMatchings = new Map<
    string,
    { mappingId: string | null; deviceGroupMatching: MatchingWithLabels }
  >();
  for (const m of notifMatchings) {
    if (!displayMatchings.has(m.deviceGroupMatching.id)) {
      displayMatchings.set(m.deviceGroupMatching.id, {
        mappingId: m.id,
        deviceGroupMatching: m.deviceGroupMatching,
      });
    }
  }
  const extraIds = [
    ...new Set(
      matchingLevelIssues.map((i) => i.deviceGroupMatchingId as string),
    ),
  ].filter((id) => !displayMatchings.has(id));
  if (extraIds.length > 0) {
    const extra = await prisma.deviceGroupMatching.findMany({
      where: { id: { in: extraIds } },
      include: { manufacturer: true, product: true, version: true },
    });
    for (const dm of extra) {
      displayMatchings.set(dm.id, {
        mappingId: null,
        deviceGroupMatching: dm,
      });
    }
  }

  // Matching-level status (and notes) per (matching, vuln).
  const statusByMatching = new Map<string, Record<string, IssueStatus>>();
  const notesByMatching = new Map<string, Record<string, string>>();
  for (const i of matchingLevelIssues) {
    const mid = i.deviceGroupMatchingId as string;
    const rec = statusByMatching.get(mid) ?? {};
    rec[i.vulnerabilityId] = i.status;
    statusByMatching.set(mid, rec);
    if (i.statusNotes) {
      const notes = notesByMatching.get(mid) ?? {};
      notes[i.vulnerabilityId] = i.statusNotes;
      notesByMatching.set(mid, notes);
    }
  }

  // Asset-level override status (and notes) per (asset, vuln).
  const overrideByAsset = new Map<string, Record<string, IssueStatus>>();
  const overrideNotesByAsset = new Map<string, Record<string, string>>();
  for (const i of assetLevelIssues) {
    const aid = i.assetId as string;
    const rec = overrideByAsset.get(aid) ?? {};
    rec[i.vulnerabilityId] = i.status;
    overrideByAsset.set(aid, rec);
    if (i.statusNotes) {
      const notes = overrideNotesByAsset.get(aid) ?? {};
      notes[i.vulnerabilityId] = i.statusNotes;
      overrideNotesByAsset.set(aid, notes);
    }
  }

  // Fetch the few override assets' device identity to assign them to matchings.
  // NOTE: to be efficient, assumes |assetLevelIssues.length| is small
  // Possible TODO in the future here...
  const overrideAssetIds = [...overrideByAsset.keys()];
  const overrideAssets =
    overrideAssetIds.length === 0
      ? []
      : await prisma.asset.findMany({
          where: { id: { in: overrideAssetIds } },
          select: deviceIdentitySelect,
        });

  const contexts: AffectedMatchingContext[] = [];
  for (const [
    matchingId,
    { mappingId, deviceGroupMatching },
  ] of displayMatchings) {
    const overrides = overrideAssets
      .filter((a) => matchingAppliesToDevice(deviceGroupMatching, a))
      .map((a) => ({
        assetId: a.id,
        statusByVuln: overrideByAsset.get(a.id) ?? {},
        notesByVuln: overrideNotesByAsset.get(a.id) ?? {},
      }));
    contexts.push({
      matchingId,
      mappingId,
      deviceGroupMatching,
      matchingStatusByVuln: statusByMatching.get(matchingId) ?? {},
      matchingNotesByVuln: notesByMatching.get(matchingId) ?? {},
      overrides,
      isNotificationLinked: mappingId !== null,
    });
  }
  return contexts;
}

export const notificationsRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      paginationInputSchema.extend({
        priority: z.array(z.nativeEnum(Priority)).default([]),
        type: z.array(z.nativeEnum(NotificationType)).default([]),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { search, sort, priority, type } = input;

      const where = {
        AND: [
          createSearchFilter(search),
          priority.length > 0 ? { priority: { in: priority } } : {},
          type.length > 0 ? { type: { in: type } } : {},
          buildUpdatedAtFilter(input),
        ],
      };

      const sortClauses = sort
        ? sort.split(",").flatMap((s) => {
            const field = s.replace("-", "");
            if (!NOTIFICATION_SORT_FIELDS.has(field)) return [];
            return [{ [field]: getSortValue(s) }];
          })
        : [];

      const totalCount = await prisma.notification.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const notifications = await prisma.notification.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        include: {
          ...notificationInclude,
          reads: {
            where: { userId: ctx.auth.user.id },
            select: { id: true },
          },
        },
        orderBy:
          sortClauses.length > 0
            ? [...sortClauses, { updatedAt: "desc" }]
            : { updatedAt: "desc" },
      });

      const items = await Promise.all(
        notifications.map(async (n) => ({
          ...n,
          deviceGroupsMatchings: await Promise.all(
            n.deviceGroupsMatchings
              .filter((m) => m.confidence !== "Rejected")
              .map(async (m) => ({
                ...m,
                assetCount: await resolvedAssetCount(m.deviceGroupMatching),
              })),
          ),
        })),
      );

      return createPaginatedResponse(items, meta);
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [notification, correctionRecords, readReceipts] = await Promise.all(
        [
          prisma.notification.findUnique({
            where: { id: input.id },
            include: {
              ...notificationDetailInclude,
              reads: {
                where: { userId: ctx.auth.user.id },
                select: { id: true },
              },
            },
          }),
          prisma.fieldCorrection.findMany({
            where: { targetType: "Notification", targetId: input.id },
            include: fieldCorrectionInclude,
            orderBy: { createdAt: "asc" },
          }),
          prisma.notificationRead.findMany({
            where: { notificationId: input.id },
            orderBy: { readAt: "desc" },
            select: readReceiptSelect,
          }),
        ],
      );

      if (!notification) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const notifMatchings = notification.deviceGroupsMatchings.filter(
        (m) => m.confidence !== "Rejected",
      );
      const vulnIds = notification.vulnerabilities.map(
        (v) => v.vulnerabilityId,
      );

      const contexts = await buildMatchingContexts(
        notifMatchings.map((m) => ({
          id: m.id,
          deviceGroupMatching: m.deviceGroupMatching,
        })),
        vulnIds,
      );

      // One COUNT per display matching
      const countByMatchingId = new Map<string, number>();
      const unknownCountByMatchingId = new Map<string, number>();

      await Promise.all(
        contexts.map(async (c) => {
          const [count, unknownCount] = await Promise.all([
            resolvedAssetCount(c.deviceGroupMatching),
            unknownVersionAssetCount(c.deviceGroupMatching),
          ]);
          countByMatchingId.set(c.matchingId, count);
          unknownCountByMatchingId.set(c.matchingId, unknownCount);
        }),
      );

      const groups: MatchingBucketGroup[] = contexts.map((c) => ({
        mappingId: c.mappingId,
        deviceGroupMatching: c.deviceGroupMatching,
        statusByVuln: c.matchingStatusByVuln,
        notesByVuln: c.matchingNotesByVuln,
        buckets: computeMatchingBuckets({
          matchingStatusByVuln: c.matchingStatusByVuln,
          overrides: c.overrides,
          totalAssetCount: countByMatchingId.get(c.matchingId) ?? 0,
          isNotificationLinked: c.isNotificationLinked,
          unknownVersionAssetCount:
            unknownCountByMatchingId.get(c.matchingId) ?? 0,
        }),
      }));
      const affectedAssets = buildAffectedAssetsSummary(groups);

      const deviceGroupsMatchings = notifMatchings.map((m) => ({
        ...m,
        assetCount: countByMatchingId.get(m.deviceGroupMatching.id) ?? 0,
      }));

      const fieldCorrections = correctionRecords.map((correction) => ({
        ...correction,
        isAgent: correction.userId === AUTOMATION_USER_ID,
      }));

      return {
        ...notification,
        deviceGroupsMatchings,
        affectedAssets,
        fieldCorrections,
        readReceipts,
      };
    }),

  getAffectedAssetsPage: protectedProcedure
    .input(
      paginationInputSchema.extend({
        notificationId: z.string(),
        matchingId: z.string(),
        bucket: z.enum(AFFECTED_BUCKETS),
      }),
    )
    .query(async ({ input }) => {
      const { notificationId, matchingId, bucket } = input;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          vulnerabilities: {
            where: notRejected,
            select: { vulnerabilityId: true },
          },
          deviceGroupsMatchings: {
            select: {
              id: true,
              confidence: true,
              deviceGroupMatching: {
                include: { manufacturer: true, product: true, version: true },
              },
            },
          },
        },
      });
      if (!notification) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const emptyMeta = buildPaginationMeta(input, 0);
      const notifMatchings = notification.deviceGroupsMatchings.filter(
        (m) => m.confidence !== "Rejected",
      );
      const vulnIds = notification.vulnerabilities.map(
        (v) => v.vulnerabilityId,
      );

      const contexts = await buildMatchingContexts(
        notifMatchings.map((m) => ({
          id: m.id,
          deviceGroupMatching: m.deviceGroupMatching,
        })),
        vulnIds,
      );
      const ctx = contexts.find((c) => c.matchingId === matchingId);
      if (!ctx) {
        return createPaginatedResponse<ResolvedDeviceGroupAsset>([], emptyMeta);
      }

      const matchedWhere = await assetWhereForMatchings([
        ctx.deviceGroupMatching,
      ]);
      const [totalAssetCount, unknownCount] = await Promise.all([
        prisma.asset.count({ where: matchedWhere }),
        unknownVersionAssetCount(ctx.deviceGroupMatching),
      ]);

      const buckets = computeMatchingBuckets({
        matchingStatusByVuln: ctx.matchingStatusByVuln,
        overrides: ctx.overrides,
        totalAssetCount,
        isNotificationLinked: ctx.isNotificationLinked,
        unknownVersionAssetCount: unknownCount,
      });
      const result = buckets[bucket];
      if (!result) {
        return createPaginatedResponse<ResolvedDeviceGroupAsset>([], emptyMeta);
      }

      const unknownWhere = unknownVersionAssetWhere(ctx.deviceGroupMatching);

      const idFilter =
        result.filter.kind === "only"
          ? { in: result.filter.assetIds }
          : result.filter.excludedAssetIds.length > 0
            ? { notIn: result.filter.excludedAssetIds }
            : undefined;

      const matched: Prisma.AssetWhereInput = {
        AND: [matchedWhere, ...(idFilter ? [{ id: idFilter }] : [])],
      };
      const where: Prisma.AssetWhereInput =
        bucket === "UNDER_INVESTIGATION" && unknownWhere
          ? { OR: [matched, unknownWhere] }
          : matched;

      // Asset-level override notes for this matching, one joined string per asset.
      // Only keep notes whose vuln status maps to the bucket being paged, so an
      // asset shown in one bucket doesn't surface a note from another bucket.
      // TODO: Consider using a dict to separate these by vuln?
      const noteByAsset = new Map<string, string>();
      for (const o of ctx.overrides) {
        const notes = [
          ...new Set(
            Object.entries(o.notesByVuln)
              .filter(
                ([vulnId]) =>
                  bucketForStatus(o.statusByVuln[vulnId]) === bucket,
              )
              .map(([, note]) => note),
          ),
        ];
        if (notes.length > 0) {
          noteByAsset.set(o.assetId, notes.join("\n"));
        }
      }

      const totalCount = await prisma.asset.count({ where });
      const meta = buildPaginationMeta(input, totalCount);
      const assets = await prisma.asset.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        select: {
          id: true,
          ip: true,
          hostname: true,
          serialNumber: true,
          location: true,
          status: true,
          manufacturerId: true,
          productId: true,
          versionStatus: true,
          version: { select: { canonicalName: true } },
        },
        orderBy: { id: "asc" },
      });

      const items: ResolvedDeviceGroupAsset[] = assets.map((a) => ({
        id: a.id,
        ip: a.ip,
        hostname: a.hostname,
        serialNumber: a.serialNumber,
        location: a.location,
        status: a.status,
        manufacturerId: a.manufacturerId,
        productId: a.productId,
        version: a.version?.canonicalName ?? null,
        versionStatus: a.versionStatus,
        statusNotes: noteByAsset.get(a.id) ?? null,
      }));
      return createPaginatedResponse(items, meta);
    }),

  getAffectedAssetUtilization: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .query(async ({ input }) => {
      const notification = await prisma.notification.findUnique({
        where: { id: input.notificationId },
        select: {
          deviceGroupsMatchings: {
            select: {
              confidence: true,
              deviceGroupMatching: {
                select: {
                  manufacturerId: true,
                  productId: true,
                  versionId: true,
                  versionRange: true,
                },
              },
            },
          },
        },
      });
      if (!notification) throw new TRPCError({ code: "NOT_FOUND" });
      const matchings = notification.deviceGroupsMatchings
        .filter((m) => m.confidence !== "Rejected")
        .map((m) => m.deviceGroupMatching);

      if (matchings.length === 0) {
        return { assets: [], totalAssetCount: 0 };
      }
      return fetchUtilizationGrids(
        await assetWhereForMatchings(matchings, { loose: true }),
      );
    }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.notificationRead.upsert({
        where: {
          notificationId_userId: {
            notificationId: input.notificationId,
            userId: ctx.auth.user.id,
          },
        },
        update: {},
        create: {
          notificationId: input.notificationId,
          userId: ctx.auth.user.id,
        },
      });
    }),

  markMatchIncorrect: protectedProcedure
    .input(
      z.object({
        targetType: z.enum(MatchFeedbackTargetType),
        targetId: z.string(),
        notificationId: z.string(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const feedback = await prisma.$transaction(async (tx) => {
        if (input.targetType === "NotificationDeviceGroupMapping") {
          await tx.notificationDeviceGroupMapping.update({
            where: {
              id: input.targetId,
              notificationId: input.notificationId,
            },
            data: { confidence: "Rejected" },
          });
        } else if (input.targetType === "NotificationVulnerabilityMapping") {
          await tx.notificationVulnerabilityMapping.update({
            where: {
              id: input.targetId,
              notificationId: input.notificationId,
            },
            data: { confidence: "Rejected" },
          });
        }
        return await tx.matchFeedback.create({
          data: {
            targetType: input.targetType,
            targetId: input.targetId,
            comment: input.comment,
            userId: ctx.auth.user.id,
            notificationId: input.notificationId,
          },
        });
      });
      if (input.comment?.trim()) {
        await requestNoteAction("MATCH_FEEDBACK", feedback.id);
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(NotificationType).optional(),
        priority: z.enum(Priority).optional(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, reason, ...changes } = input;
      return prisma.$transaction(async (tx) => {
        const before = await tx.notification.findUniqueOrThrow({
          where: { id },
          select: { type: true, priority: true },
        });

        const notification = await tx.notification.update({
          where: { id },
          data: changes,
          select: { id: true, type: true, priority: true },
        });

        await recordFieldCorrections(tx, {
          targetType: "Notification",
          targetId: id,
          userId: ctx.auth.user.id,
          reason,
          before,
          after: changes,
        });

        return notification;
      });
    }),

  getVersionForManufacturerProduct: protectedProcedure
    .input(z.object({ manufacturerId: z.string(), productId: z.string() }))
    .query(async ({ input }) => {
      return prisma.version.findMany({
        where: {
          productId: input.productId,
          product: { manufacturerId: input.manufacturerId },
          assets: { some: {} },
        },
        select: { canonicalDisplayName: true },
        orderBy: { canonicalDisplayName: "asc" },
      });
    }),
});
