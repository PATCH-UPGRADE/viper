import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  IssueStatus,
  MatchFeedbackTargetType,
  NotificationType,
  Priority,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  type MatchingWithLabels,
  notificationDetailInclude,
  notificationInclude,
  type ResolvedDeviceGroupAsset,
} from "../types";
import type { AffectedBucket } from "./affected-assets";
import {
  buildAffectedAssetsSummary,
  computeMatchingBuckets,
  type MatchingBucketGroup,
} from "./affected-assets";

type MatchingIdentity = {
  vendorId: string;
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

const ALLOWED_SORT_FIELDS = new Set(["priority", "updatedAt", "createdAt"]);

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

async function resolvedDeviceGroupAssetCount(
  matching: MatchingIdentity,
): Promise<number> {
  const candidates = await prisma.deviceGroup.findMany({
    where: deviceGroupWhereForMatching(matching),
    select: {
      id: true,
      vendorId: true,
      productId: true,
      versionId: true,
      version: { select: { canonicalName: true } },
      _count: { select: { assets: true } },
    },
  });
  return candidates
    .filter((dg) => matchingAppliesToDeviceGroup(matching, dg))
    .reduce((sum, dg) => sum + dg._count.assets, 0);
}

/** Ids of the concrete device groups a matching resolves to (for paginated asset queries). */
async function resolveMatchedDeviceGroupIds(
  matching: MatchingIdentity,
): Promise<string[]> {
  const candidates = await prisma.deviceGroup.findMany({
    where: deviceGroupWhereForMatching(matching),
    select: {
      id: true,
      vendorId: true,
      productId: true,
      versionId: true,
      version: { select: { canonicalName: true } },
    },
  });
  return candidates
    .filter((dg) => matchingAppliesToDeviceGroup(matching, dg))
    .map((dg) => dg.id);
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
            status: { not: IssueStatus.FIXED },
          },
          select: {
            vulnerabilityId: true,
            deviceGroupMatchingId: true,
            assetId: true,
            status: true,
            statusNotes: true,
          },
        });

  const matchingLevelIssues = issues.filter(
    (i) => i.assetId === null && i.deviceGroupMatchingId !== null,
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
      include: { vendor: true, product: true, version: true },
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

  // Fetch the few override assets' device-group identity to assign them to matchings.
  // NOTE: to be efficient, assumes |assetLevelIssues.length| is small
  // Possible TODO in the future here...
  const overrideAssetIds = [...overrideByAsset.keys()];
  const overrideAssets =
    overrideAssetIds.length === 0
      ? []
      : await prisma.asset.findMany({
          where: { id: { in: overrideAssetIds } },
          select: {
            id: true,
            deviceGroup: {
              select: {
                vendorId: true,
                productId: true,
                versionId: true,
                version: { select: { canonicalName: true } },
              },
            },
          },
        });

  const contexts: AffectedMatchingContext[] = [];
  for (const [
    matchingId,
    { mappingId, deviceGroupMatching },
  ] of displayMatchings) {
    const overrides = overrideAssets
      .filter((a) =>
        matchingAppliesToDeviceGroup(deviceGroupMatching, {
          id: a.id,
          ...a.deviceGroup,
        }),
      )
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
        ],
      };

      const sortClauses = sort
        ? sort.split(",").flatMap((s) => {
            const field = s.replace("-", "");
            if (!ALLOWED_SORT_FIELDS.has(field)) return [];
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
                assetCount: await resolvedDeviceGroupAssetCount(
                  m.deviceGroupMatching,
                ),
              })),
          ),
        })),
      );

      return createPaginatedResponse(items, meta);
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const notification = await prisma.notification.findUnique({
        where: { id: input.id },
        include: {
          ...notificationDetailInclude,
          reads: {
            where: { userId: ctx.auth.user.id },
            select: { id: true },
          },
        },
      });

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
      await Promise.all(
        contexts.map(async (c) => {
          countByMatchingId.set(
            c.matchingId,
            await resolvedDeviceGroupAssetCount(c.deviceGroupMatching),
          );
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
        }),
      }));
      const affectedAssets = buildAffectedAssetsSummary(groups);

      const deviceGroupsMatchings = notifMatchings.map((m) => ({
        ...m,
        assetCount: countByMatchingId.get(m.deviceGroupMatching.id) ?? 0,
      }));

      return { ...notification, deviceGroupsMatchings, affectedAssets };
    }),

  getAffectedAssetsPage: protectedProcedure
    .input(
      paginationInputSchema.extend({
        notificationId: z.string(),
        matchingId: z.string(),
        bucket: z.enum([
          "needsAttention",
          "needsInformation",
          "lowConcern",
          "unaffected",
        ]),
      }),
    )
    .query(async ({ input }) => {
      const { notificationId, matchingId } = input;
      const bucket = input.bucket as AffectedBucket;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          vulnerabilities: { select: { vulnerabilityId: true } },
          deviceGroupsMatchings: {
            select: {
              id: true,
              confidence: true,
              deviceGroupMatching: {
                include: { vendor: true, product: true, version: true },
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

      const totalAssetCount = await resolvedDeviceGroupAssetCount(
        ctx.deviceGroupMatching,
      );
      const buckets = computeMatchingBuckets({
        matchingStatusByVuln: ctx.matchingStatusByVuln,
        overrides: ctx.overrides,
        totalAssetCount,
        isNotificationLinked: ctx.isNotificationLinked,
      });
      const result = buckets[bucket];
      if (!result) {
        return createPaginatedResponse<ResolvedDeviceGroupAsset>([], emptyMeta);
      }

      const deviceGroupIds = await resolveMatchedDeviceGroupIds(
        ctx.deviceGroupMatching,
      );
      const idFilter =
        result.filter.kind === "only"
          ? { in: result.filter.assetIds }
          : result.filter.excludedAssetIds.length > 0
            ? { notIn: result.filter.excludedAssetIds }
            : undefined;
      const where = {
        deviceGroupId: { in: deviceGroupIds },
        ...(idFilter ? { id: idFilter } : {}),
      };

      // Asset-level override notes for this matching, one joined string per asset.
      // TODO: Consider using a dict to separate these by vuln?
      const noteByAsset = new Map<string, string>();
      for (const o of ctx.overrides) {
        const notes = [...new Set(Object.values(o.notesByVuln))];
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
          location: true,
          status: true,
          deviceGroup: {
            select: { version: { select: { canonicalName: true } } },
          },
        },
        orderBy: { id: "asc" },
      });

      const items: ResolvedDeviceGroupAsset[] = assets.map((a) => ({
        id: a.id,
        ip: a.ip,
        hostname: a.hostname,
        location: a.location,
        status: a.status,
        version: a.deviceGroup.version?.canonicalName ?? null,
        statusNotes: noteByAsset.get(a.id) ?? null,
      }));
      return createPaginatedResponse(items, meta);
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
      await prisma.$transaction(async (tx) => {
        if (input.targetType === "NotificationDeviceGroupMapping") {
          await tx.notificationDeviceGroupMapping.update({
            where: { id: input.targetId },
            data: { confidence: "Rejected" },
          });
        }
        await tx.matchFeedback.create({
          data: {
            targetType: input.targetType,
            targetId: input.targetId,
            comment: input.comment,
            userId: ctx.auth.user.id,
            notificationId: input.notificationId,
          },
        });
      });
    }),
});
