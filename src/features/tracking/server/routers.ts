import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { validatePlatformPayload } from "@/features/work-orders/server/payload";
import {
  claimForSubmission,
  releaseClaim,
} from "@/features/work-orders/server/submit";
import { inngest } from "@/inngest/client";
import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  Priority,
  type Prisma,
  ResourceType,
  SubmissionState,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import prisma, { type TransactionClient } from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  createSortParser,
  fetchPaginated,
  processIntegrationToken,
} from "@/lib/router-utils";
import { integrationResponseSchema } from "@/lib/schemas";
import { sourceContentHash } from "@/lib/source-hash";
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import { TRACKING_TABS } from "../params";
import {
  integrationWorkOrderInputSchema,
  paginatedWorkOrderListResponseSchema,
  ticketBaseInclude,
  ticketCommentResponseSchema,
  ticketDetailInclude,
  workOrderDetailResponseSchema,
  workOrderListFilterSchema,
  workOrderListInclude,
} from "../types";
import {
  recordAssetActivity,
  recordChildActivity,
  recordCreationActivity,
  recordUpdateActivities,
  snapshotBeforeUpdate,
} from "./activities";
import { cascadeDoneStatus, createAssetTicket } from "./asset-tickets";

// A lost create-race (or a retry) surfaces as a P2002 unique violation. Duck-typed
// on `code` rather than `instanceof`: across Next.js module boundaries the thrown
// error can be a different copy of PrismaClientKnownRequestError, so `instanceof`
// is unreliable.
function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

const isUniqueViolation = (error: unknown): boolean =>
  hasPrismaCode(error, "P2002");

async function assertNoTicketCycle(
  tx: TransactionClient,
  parentId: string,
  childId: string,
): Promise<void> {
  const visited = new Set([childId]);
  let ancestorId: string | null = parentId;

  while (ancestorId) {
    if (visited.has(ancestorId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create a ticket hierarchy cycle",
      });
    }
    visited.add(ancestorId);

    const ancestor: { parentId: string | null } | null =
      await tx.workOrderTicket.findUnique({
        where: { id: ancestorId },
        select: { parentId: true },
      });
    ancestorId = requireExistence(ancestor, "Parent ticket").parentId;
  }
}

const trackingInputSchema = paginationInputSchema.extend({
  tab: z.enum(TRACKING_TABS).default("suggested"),
});

const createSearchFilter = (
  search: string,
): Prisma.WorkOrderTicketWhereInput =>
  search
    ? {
        OR: [
          { summary: { contains: search, mode: "insensitive" } },
          {
            descriptions: {
              some: { body: { contains: search, mode: "insensitive" } },
            },
          },
        ],
      }
    : {};

// Whitelist of fields the tracking table can sort on. Anything else in the
// `?sort=` param is ignored so we don't blindly forward arbitrary user input
// to Prisma's orderBy.
const parseSort = createSortParser(
  new Set([
    "summary",
    "status",
    "category",
    "scheduledAt",
    "createdAt",
    "updatedAt",
  ] as const),
  [{ updatedAt: "desc" }],
);

const ticketLinkedCount = (count: {
  issues: number;
  vulnerabilities: number;
  remediations: number;
  assets: number;
}) => count.issues + count.vulnerabilities + count.remediations + count.assets;

const buildLinkedPreview = (ticket: {
  vulnerabilities: { id: string; cveId: string | null }[];
  assets: { asset: { id: string; hostname: string | null } }[];
}) => [
  ...ticket.vulnerabilities.map((v) => ({
    id: v.id,
    label: v.cveId ?? v.id,
  })),
  ...ticket.assets.map(({ asset: a }) => ({
    id: a.id,
    label: a.hostname ?? a.id,
  })),
];

// Per-procedure include scoping `watchers` to the current user so each row only
// reflects whether *they* are watching. Pair with `withIsWatching` to collapse
// the (0-or-1 length) array into a boolean.
const watchedBy = (userId: string) =>
  ({
    watchers: { where: { userId }, select: { userId: true } },
  }) satisfies Prisma.WorkOrderTicketInclude;

const withIsWatching = <T extends { watchers: { userId: string }[] }>(
  row: T,
): Omit<T, "watchers"> & { isWatching: boolean } => {
  const { watchers, ...rest } = row;
  return { ...rest, isWatching: watchers.length > 0 };
};

// getMany rows additionally carry the current user's `seenBy` so we can derive
// the unread-comments indicator. Scopes both watch + seen state to the user.
const rowStateFor = (userId: string) =>
  ({
    watchers: { where: { userId }, select: { userId: true } },
    seenBy: { where: { userId }, select: { seenAt: true } },
  }) satisfies Prisma.WorkOrderTicketInclude;

// A ticket has unread comments when its latest comment is newer than the
// current user's last view (or they've never viewed it).
const hasUnread = (
  lastCommentAt: Date | null,
  seenBy: { seenAt: Date }[],
): boolean => {
  if (!lastCommentAt) return false;
  const seenAt = seenBy[0]?.seenAt;
  return !seenAt || lastCommentAt > seenAt;
};

// Collapse the per-user `watchers`/`seenBy` arrays into the booleans the table
// renders. `lastCommentAt` is passed explicitly so parents can use a value
// rolled up across their children.
const withRowFlags = <
  T extends {
    watchers: { userId: string }[];
    seenBy: { seenAt: Date }[];
  },
>(
  row: T,
  lastCommentAt: Date | null,
): Omit<T, "watchers" | "seenBy"> & {
  isWatching: boolean;
  hasUnreadComments: boolean;
} => {
  const { watchers, seenBy, ...rest } = row;
  return {
    ...rest,
    isWatching: watchers.length > 0,
    hasUnreadComments: hasUnread(lastCommentAt, seenBy),
  };
};

export const trackingRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(trackingInputSchema)
    .query(async ({ input, ctx }) => {
      const { search, tab } = input;

      // Build the parent-row filter and a separate "child match" filter that
      // determines which children are returned inside each parent's expander.
      let parentTabWhere: Prisma.WorkOrderTicketWhereInput = {};
      let childTabWhere: Prisma.WorkOrderTicketWhereInput = { ticket: null };

      if (tab === "requires-approval") {
        const status = TicketStatus.REQUIRES_APPROVAL;
        childTabWhere = { ...childTabWhere, status };
        parentTabWhere = {
          OR: [{ status }, { children: { some: { status } } }],
        };
      } else if (tab === "suggested") {
        // "Suggested" surfaces auto-ingested tickets — those with a source
        // artifact (email/integration) rather than a user creating it by hand.
        const ingested = { sourceLinks: { some: {} } };
        childTabWhere = { ...childTabWhere, ...ingested };
        parentTabWhere = {
          OR: [ingested, { children: { some: ingested } }],
        };
      } else if (tab === "my-department") {
        const me = await prisma.user.findUnique({
          where: { id: ctx.auth.user.id },
          select: { departmentId: true },
        });
        parentTabWhere = me?.departmentId
          ? { departments: { some: { id: me.departmentId } } }
          : { id: "__no_department__" };
      }

      const where: Prisma.WorkOrderTicketWhereInput = {
        AND: [
          { parentId: null },
          { isDraft: false },
          parentTabWhere,
          createSearchFilter(search),
        ],
      };

      const totalCount = await prisma.workOrderTicket.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const rowState = rowStateFor(ctx.auth.user.id);
      const tickets = await prisma.workOrderTicket.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        include: {
          ...ticketBaseInclude,
          ...rowState,
          children: {
            include: { ...ticketBaseInclude, ...rowState },
            where: { isDraft: false, ...childTabWhere },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: parseSort(input.sort),
      });

      const items = tickets.map((t) => {
        const children = t.children.map((c) =>
          withRowFlags(
            {
              ...c,
              linkedCount: ticketLinkedCount(c._count),
              commentCount: c._count.comments,
              linkedPreview: buildLinkedPreview(c),
            },
            c.lastCommentAt,
          ),
        );

        const rolledLinked =
          ticketLinkedCount(t._count) +
          children.reduce((sum, c) => sum + c.linkedCount, 0);
        const rolledComments =
          t._count.comments +
          children.reduce((sum, c) => sum + c.commentCount, 0);

        // Roll up linked items from children so parents with no direct links
        // still show preview chips drawn from their children's scope.
        const seen = new Set<string>();
        const rolledPreview = [
          ...buildLinkedPreview(t),
          ...children.flatMap((c) => c.linkedPreview),
        ].filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        // Roll up the latest comment time across the parent and its children so
        // the parent row flags unread comments anywhere in its subtree.
        const commentTimes = [
          t.lastCommentAt,
          ...t.children.map((c) => c.lastCommentAt),
        ].filter((d): d is Date => d !== null);
        const rolledLastCommentAt = commentTimes.length
          ? new Date(Math.max(...commentTimes.map((d) => d.getTime())))
          : null;

        return withRowFlags(
          {
            ...t,
            children,
            linkedCount: rolledLinked,
            commentCount: rolledComments,
            linkedPreview: rolledPreview,
          },
          rolledLastCommentAt,
        );
      });

      return createPaginatedResponse(items, meta);
    }),

  getManyByAssetId: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .query(async ({ input }) => {
      const asset = await prisma.asset.findUnique({
        where: { id: input.assetId },
        select: { id: true },
      });
      requireExistence(asset, "Asset");

      const tickets = await prisma.workOrderTicket.findMany({
        where: {
          isDraft: false,
          status: { not: TicketStatus.DONE },
          ticket: { assetId: input.assetId },
        },
        select: {
          id: true,
          summary: true,
          body: true,
          status: true,
          category: true,
          scheduledAt: true,
          departments: {
            select: { id: true, name: true, color: true },
            orderBy: { name: "asc" },
          },
          _count: { select: { comments: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      return tickets.map(({ _count, ...ticket }) => ({
        ...ticket,
        commentCount: _count.comments,
      }));
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/work-orders/{id}",
        tags: ["Work Orders"],
        summary: "Get a work-order ticket",
        description:
          "Fetch a single work-order ticket with linked entities, sub-tickets, and comments.",
      },
    })
    .output(workOrderDetailResponseSchema)
    .query(async ({ input, ctx }) => {
      const ticket = await prisma.workOrderTicket.findUnique({
        where: { id: input.id },
        include: {
          ...ticketDetailInclude,
          ...watchedBy(ctx.auth.user.id),
        },
      });
      return withIsWatching(requireExistence(ticket, "Ticket"));
    }),

  list: protectedProcedure
    .input(paginationInputSchema.extend(workOrderListFilterSchema.shape))
    .meta({
      openapi: {
        method: "GET",
        path: "/work-orders",
        tags: ["Work Orders"],
        summary: "List work-order tickets",
        description:
          "Return a paginated set of work-order tickets matching the given filters, with linked entities (assets, vulnerabilities, remediations) included.",
      },
    })
    .output(paginatedWorkOrderListResponseSchema)
    .query(async ({ input, ctx }) => {
      const { search, departmentIds, assigneeIds } = input;
      const filters: Prisma.WorkOrderTicketWhereInput[] = [
        { isDraft: false, ticket: null },
        createSearchFilter(search),
      ];

      if (departmentIds && departmentIds.length > 0) {
        filters.push({
          departments: { some: { id: { in: departmentIds } } },
        });
      }
      if (assigneeIds && assigneeIds.length > 0) {
        filters.push({ assigneeId: { in: assigneeIds } });
      }

      const result = await fetchPaginated(prisma.workOrderTicket, input, {
        where: { AND: filters },
        include: {
          ...workOrderListInclude,
          ...watchedBy(ctx.auth.user.id),
        },
        orderBy: parseSort(input.sort),
      });

      return {
        ...result,
        items: result.items.map(({ watchers, ...item }) => ({
          ...item,
          isWatching: watchers.length > 0,
        })),
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        summary: z.string().trim().min(1).max(255).optional(),
        body: z.string().max(50_000).nullish(),
        status: z.enum(TicketStatus).optional(),
        category: z.enum(TicketCategory).optional(),
        priority: z.enum(Priority).optional(),
        departmentIds: z.array(z.string()).optional(),
        descriptions: z
          .array(
            z.object({
              departmentId: z.string(),
              body: z.string().max(10_000),
            }),
          )
          .optional(),
        assigneeId: z.string().nullish(),
        scheduledAt: z.coerce.date().nullish(),
      }),
    )
    .meta({
      openapi: {
        method: "PATCH",
        path: "/work-orders/{id}",
        tags: ["Work Orders"],
        summary: "Update a work-order ticket",
        description:
          "Partially update a work-order ticket. Any omitted field is left untouched. Pass null on nullable fields (assigneeId, scheduledAt) to clear them. Pass an empty array on departmentIds to clear all departments. `descriptions` replaces the per-department description set wholesale; entries with empty bodies are dropped, and removed departments lose their descriptions automatically.",
      },
    })
    .output(workOrderDetailResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, departmentIds, descriptions, ...rest } = input;
      return prisma.$transaction(async (tx) => {
        const before = await snapshotBeforeUpdate(tx, id);
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Ticket not found",
          });
        }

        // Compute the post-update department set so we can scope description
        // writes (and orphan cleanups) to currently-linked departments only.
        const nextDepartmentIds = new Set(
          departmentIds ?? before.departments.map((d) => d.id),
        );

        // Normalize `descriptions`: keep only non-empty bodies for departments
        // that will still be on the ticket after this update.
        const nextDescriptions = (descriptions ?? []).filter(
          (d) =>
            d.body.trim().length > 0 && nextDepartmentIds.has(d.departmentId),
        );

        await tx.workOrderTicket.update({
          where: { id },
          data: {
            ...rest,
            ...(departmentIds !== undefined && {
              departments: { set: departmentIds.map((dId) => ({ id: dId })) },
            }),
          },
        });

        // Reconcile per-department descriptions when the caller sent the
        // field, or when the department set shrank and may have orphaned
        // descriptions. Either way, the desired state is `nextDescriptions`
        // plus pre-existing rows for departments not touched in this update.
        if (descriptions !== undefined || departmentIds !== undefined) {
          const beforeByDept = new Map(
            before.descriptions.map((d) => [d.departmentId, d.body]),
          );
          const desiredByDept = new Map<string, string>();
          if (descriptions !== undefined) {
            for (const d of nextDescriptions) {
              desiredByDept.set(d.departmentId, d.body);
            }
          } else {
            // departmentIds changed but descriptions wasn't passed: preserve
            // existing descriptions for departments still on the ticket.
            for (const [deptId, body] of beforeByDept) {
              if (nextDepartmentIds.has(deptId)) {
                desiredByDept.set(deptId, body);
              }
            }
          }

          const toDelete: string[] = [];
          for (const [deptId] of beforeByDept) {
            if (!desiredByDept.has(deptId)) toDelete.push(deptId);
          }
          if (toDelete.length > 0) {
            await tx.ticketDescription.deleteMany({
              where: { ticketId: id, departmentId: { in: toDelete } },
            });
          }
          for (const [deptId, body] of desiredByDept) {
            if (beforeByDept.get(deptId) === body) continue;
            await tx.ticketDescription.upsert({
              where: {
                ticketId_departmentId: { ticketId: id, departmentId: deptId },
              },
              create: { ticketId: id, departmentId: deptId, body },
              update: { body },
            });
          }
        }

        // Build the canonical descriptions list the activity helper should
        // diff against (so removed-department descriptions show up as
        // cleared, even if the caller didn't pass `descriptions`).
        const descriptionsForActivity =
          descriptions !== undefined
            ? nextDescriptions
            : before.descriptions.filter((d) =>
                nextDepartmentIds.has(d.departmentId),
              );
        await recordUpdateActivities(tx, id, ctx.auth.user.id, before, {
          ...input,
          descriptions:
            descriptions !== undefined || departmentIds !== undefined
              ? descriptionsForActivity
              : undefined,
        });
        if (rest.status === TicketStatus.DONE) {
          await cascadeDoneStatus(tx, id, ctx.auth.user.id);
        }
        // Auto-watch: whoever a ticket is (re)assigned to starts watching it.
        if (
          rest.assigneeId !== undefined &&
          rest.assigneeId !== null &&
          rest.assigneeId !== before.assigneeId
        ) {
          await tx.ticketWatch.upsert({
            where: {
              userId_ticketId: { userId: rest.assigneeId, ticketId: id },
            },
            create: { userId: rest.assigneeId, ticketId: id },
            update: {},
          });
        }

        // Re-fetch so the response includes the freshly-written activity rows.
        const updated = await tx.workOrderTicket.findUniqueOrThrow({
          where: { id },
          include: {
            ...ticketDetailInclude,
            ...watchedBy(ctx.auth.user.id),
          },
        });
        return withIsWatching(updated);
      });
    }),

  attachChild: protectedProcedure
    .input(z.object({ parentId: z.string(), childId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.parentId === input.childId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A ticket cannot be its own sub-ticket",
        });
      }
      const child = await prisma.workOrderTicket.findUnique({
        where: { id: input.childId },
        select: { ticket: { select: { id: true } } },
      });
      if (!child) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      if (child.ticket) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot attach a ticket that's linked to an asset",
        });
      }
      return prisma.$transaction(async (tx) => {
        await assertNoTicketCycle(tx, input.parentId, input.childId);
        const updated = await tx.workOrderTicket.update({
          where: { id: input.childId },
          data: { parentId: input.parentId },
        });
        await recordChildActivity(
          tx,
          input.parentId,
          ctx.auth.user.id,
          input.childId,
          "attached",
        );
        return updated;
      });
    }),

  detachChild: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        // Snapshot the parent id BEFORE we null it out, since the activity
        // belongs on the parent's timeline.
        const child = await tx.workOrderTicket.findUnique({
          where: { id: input.ticketId },
          select: { parentId: true, ticket: { select: { id: true } } },
        });
        if (child?.ticket) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Cannot detach an asset-linked ticket here — detach the asset from the Linked Assets tab instead",
          });
        }
        const updated = await tx.workOrderTicket.update({
          where: { id: input.ticketId },
          data: { parentId: null },
        });
        if (child?.parentId) {
          await recordChildActivity(
            tx,
            child.parentId,
            ctx.auth.user.id,
            input.ticketId,
            "detached",
          );
        }
        return updated;
      });
    }),

  listAttachableChildren: protectedProcedure
    .input(z.object({ parentId: z.string() }))
    .query(async ({ input }) => {
      const tickets = await prisma.workOrderTicket.findMany({
        where: {
          id: { not: input.parentId },
          ticket: null,
          isDraft: false,
        },
        select: {
          id: true,
          summary: true,
          status: true,
          parent: { select: { id: true, summary: true } },
        },
        orderBy: [
          { parentId: { sort: "asc", nulls: "first" } },
          { summary: "asc" },
        ],
        take: 100,
      });

      // No-parent tickets first (alphabetically by summary), then parented
      // ones (also alphabetically by summary).
      return tickets.sort((a, b) => {
        if (!a.parent && b.parent) return -1;
        if (a.parent && !b.parent) return 1;
        return a.summary.localeCompare(b.summary);
      });
    }),

  attachAsset: protectedProcedure
    .input(z.object({ ticketId: z.string(), assetId: z.string() }))
    .meta({
      openapi: {
        method: "POST",
        path: "/work-orders/{ticketId}/assets/{assetId}",
        tags: ["Work Orders"],
        summary: "Attach an asset to a work-order ticket",
        description:
          "Link an existing asset to the given work-order ticket. Creates a dedicated child ticket for the asset. Returns the updated ticket detail.",
      },
    })
    .output(workOrderDetailResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return prisma
        .$transaction(async (tx) => {
          await createAssetTicket(tx, {
            parentTicketId: input.ticketId,
            assetId: input.assetId,
            actorId: ctx.auth.user.id,
          });
          // Re-fetch so activities and the just-attached asset are in the
          // response.
          const refetched = await tx.workOrderTicket.findUniqueOrThrow({
            where: { id: input.ticketId },
            include: {
              ...ticketDetailInclude,
              ...watchedBy(ctx.auth.user.id),
            },
          });
          return withIsWatching(refetched);
        })
        .catch((error) => {
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Asset is already linked to this ticket",
            });
          }
          throw error;
        });
    }),

  detachAsset: protectedProcedure
    .input(z.object({ ticketId: z.string(), assetId: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/work-orders/{ticketId}/assets/{assetId}",
        tags: ["Work Orders"],
        summary: "Detach an asset from a work-order ticket",
        description:
          "Unlink an asset from the given work-order ticket. The asset itself is not deleted. Returns the updated ticket detail.",
      },
    })
    .output(workOrderDetailResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        const assetTicket = await tx.assetTicket.findUnique({
          where: {
            parentTicketId_assetId: {
              parentTicketId: input.ticketId,
              assetId: input.assetId,
            },
          },
          select: {
            ticketId: true,
            asset: { select: { hostname: true, ip: true } },
          },
        });
        if (!assetTicket) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Asset is not linked to this ticket",
          });
        }
        await recordAssetActivity(
          tx,
          input.ticketId,
          ctx.auth.user.id,
          input.assetId,
          "detached",
          assetTicket.asset,
        );
        await tx.workOrderTicket.delete({
          where: { id: assetTicket.ticketId },
        });
        const refetched = await tx.workOrderTicket.findUniqueOrThrow({
          where: { id: input.ticketId },
          include: {
            ...ticketDetailInclude,
            ...watchedBy(ctx.auth.user.id),
          },
        });
        return withIsWatching(refetched);
      });
    }),

  listAttachableAssets: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      // Only return assets not already attached to this ticket so the picker
      // doesn't show duplicates of what's already in the table.
      return prisma.asset.findMany({
        where: {
          assetTickets: { none: { parentTicketId: input.ticketId } },
        },
        select: {
          id: true,
          hostname: true,
          ip: true,
          role: true,
          deviceGroup: {
            select: {
              manufacturer: { select: { canonicalDisplayName: true } },
              product: { select: { canonicalDisplayName: true } },
            },
          },
        },
        orderBy: [{ hostname: "asc" }, { ip: "asc" }],
        take: 100,
      });
    }),

  setWatching: protectedProcedure
    .input(z.object({ ticketId: z.string(), watching: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const key = {
        userId_ticketId: {
          userId: ctx.auth.user.id,
          ticketId: input.ticketId,
        },
      };
      if (input.watching) {
        await prisma.ticketWatch.upsert({
          where: key,
          create: { userId: ctx.auth.user.id, ticketId: input.ticketId },
          update: {},
        });
      } else {
        await prisma.ticketWatch.deleteMany({
          where: { userId: ctx.auth.user.id, ticketId: input.ticketId },
        });
      }
      return { ticketId: input.ticketId, isWatching: input.watching };
    }),

  // Stamp a ticket as seen by the current user (clears its unread-comments
  // indicator). Upserts on (userId, ticketId) so re-fires are cheap.
  markSeen: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      await prisma.ticketSeen.upsert({
        where: {
          userId_ticketId: {
            userId: ctx.auth.user.id,
            ticketId: input.ticketId,
          },
        },
        create: {
          userId: ctx.auth.user.id,
          ticketId: input.ticketId,
          seenAt: now,
        },
        update: { seenAt: now },
      });
      return { ticketId: input.ticketId };
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .meta({
      openapi: {
        method: "POST",
        path: "/work-orders/{ticketId}/comments",
        tags: ["Work Orders"],
        summary: "Add a comment to a work-order ticket",
        description:
          "Post a comment authored by the authenticated user. Bumps the ticket's lastCommentAt in the same transaction.",
      },
    })
    .output(ticketCommentResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        const comment = await tx.ticketComment.create({
          data: {
            ticketId: input.ticketId,
            authorId: ctx.auth.user.id,
            body: input.body,
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                department: { select: { id: true, name: true, color: true } },
              },
            },
          },
        });
        await tx.workOrderTicket.update({
          where: { id: input.ticketId },
          data: { lastCommentAt: comment.createdAt },
        });
        await tx.ticketSeen.upsert({
          where: {
            userId_ticketId: {
              userId: ctx.auth.user.id,
              ticketId: input.ticketId,
            },
          },
          create: {
            userId: ctx.auth.user.id,
            ticketId: input.ticketId,
            seenAt: comment.createdAt,
          },
          update: { seenAt: comment.createdAt },
        });
        return comment;
      });
    }),

  // ─── Work orders proposed by an agent ──────────────────────────────────────

  /**
   * How far has this proposal got? Chat history rehydrates stored tool parts on
   * reload, so without this the card would offer a live Approve button for an
   * order that has already been filed.
   */
  getWorkOrderDraft: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      const ticket = await prisma.workOrderTicket.findUnique({
        where: { id: input.ticketId },
        select: {
          id: true,
          isDraft: true,
          submissionState: true,
          submissionError: true,
          externalMappings: { select: { externalId: true } },
          children: {
            select: { externalMappings: { select: { externalId: true } } },
          },
        },
      });
      if (!ticket) return null;

      return {
        isDraft: ticket.isDraft,
        submissionState: ticket.submissionState,
        submissionError: ticket.submissionError,
        // The mapping lives on the per-asset child, because one platform record
        // exists per asset. The parent carries one only for platforms that file
        // per ticket.
        externalIds: [
          ...ticket.externalMappings.map((m) => m.externalId),
          ...ticket.children.flatMap((c) =>
            c.externalMappings.map((m) => m.externalId),
          ),
        ],
      };
    }),

  /**
   * Approve a proposed work order: promote it out of draft so VIPER tracks it,
   * then, when a platform manages its assets, hand it to the submitter.
   *
   * The filing itself runs as a job. A work order can cover dozens of assets and
   * signing in to a vendor is slow, so doing it here would risk a timeout with
   * orders already dispatched and nothing recorded.
   */
  approveWorkOrder: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const found = await prisma.workOrderTicket.findUnique({
        where: { id: input.ticketId },
        select: {
          id: true,
          isDraft: true,
          mitigationPlanId: true,
          targetIntegrationId: true,
          platformPayload: true,
          submissionState: true,
        },
      });
      const ticket = requireExistence(found, "Work order");

      // A mitigation-plan ticket is drafted and promoted by the plan's own
      // accept flow. Approving one here would publish it without the plan.
      if (ticket.mitigationPlanId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This work order belongs to a mitigation plan. Accept the plan instead.",
        });
      }

      // Checked before anything is promoted: a rejected payload must leave the
      // proposal exactly as it was, so the card can still offer Approve. It is
      // re-checked here rather than trusted from drafting time, because a stored
      // payload can outlive the rules that accepted it and the client is
      // untrusted.
      if (ticket.targetIntegrationId) {
        const checked = await validatePlatformPayload(
          ticket.targetIntegrationId,
          ticket.platformPayload,
        );
        if (!checked.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: checked.reason });
        }
      }

      // Promote once the payload is known to be fileable. A filing that fails
      // after this still leaves a tracked work order, so the user's decision is
      // never lost. The per-asset children carry the parent's draft state, so
      // they are promoted with it.
      if (ticket.isDraft) {
        await prisma.workOrderTicket.updateMany({
          where: {
            OR: [{ id: ticket.id }, { parentId: ticket.id }],
            isDraft: true,
          },
          data: { isDraft: false },
        });
        try {
          await recordCreationActivity(ticket.id);
        } catch (error) {
          console.error("recordCreationActivity (approve) failed", error);
        }
      }

      if (!ticket.targetIntegrationId) {
        // Nothing manages these assets, so VIPER tracks it and that is all.
        return { ticketId: ticket.id, submissionState: ticket.submissionState };
      }

      // Two approvals racing each other both read PENDING; only one claim wins,
      // and the loser must not send a second order.
      const claimed = await claimForSubmission(ticket.id);
      if (!claimed) {
        const current = await prisma.workOrderTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          select: { submissionState: true },
        });
        return {
          ticketId: ticket.id,
          submissionState: current.submissionState,
        };
      }

      // The claim is held from here on. If the job is never queued, nothing else
      // releases it, and the ticket stays SUBMITTING forever with no filing and
      // no retry, so hand it back before reporting the failure.
      try {
        await inngest.send({
          name: "workOrder/submit.requested",
          data: { ticketId: ticket.id, actorId: ctx.auth.user.id },
        });
      } catch (error) {
        await releaseClaim(ticket.id, error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Could not start filing the work order: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }

      return {
        ticketId: ticket.id,
        submissionState: SubmissionState.SUBMITTING,
      };
    }),

  processIntegrationCreate: baseProcedure
    .input(integrationWorkOrderInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/workOrders/integrationUpload/{token}",
        tags: ["Work Orders"],
        summary: "Synchronize Work Orders with integration",
        description:
          "Synchronize Work Order tickets on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ input }) => {
      const { userId, integrationId, resource } = await processIntegrationToken(
        input.token,
        ResourceType.WorkOrder,
      );

      return processIntegrationSync(
        prisma,
        {
          model: prisma.workOrderTicket,
          mappingModel: prisma.externalWorkOrderMapping,
          transformInputItem: async (item, creatorId) => {
            const {
              vendorId,
              scheduledAt,
              source,
              upstreamApi: _upstreamApi,
              webUrl: _webUrl,
              ...fields
            } = item;
            const scheduled = scheduledAt ? new Date(scheduledAt) : null;
            return {
              // The integration user (resolved from the token) owns tickets it
              // creates; WorkOrderTicket requires a creator.
              createData: {
                ...fields,
                scheduledAt: scheduled,
                creator: { connect: { id: creatorId } },
                // Attach an ingested-source record (created once with the
                // ticket) so it shows a source badge and lands in the Suggested
                // tab. Re-syncs take the update path and leave sources alone.
                ...(source
                  ? {
                      sourceLinks: {
                        create: {
                          sourceRecord: {
                            create: {
                              channel: source.channel,
                              externalId: source.externalId ?? vendorId,
                              markdown: source.markdown ?? null,
                              raw: source.raw ?? {},
                              contentHash: sourceContentHash(
                                source.raw ?? {},
                                source.markdown,
                              ),
                            },
                          },
                        },
                      },
                    }
                  : {}),
              },
              // Never reassign creator on re-sync; only refresh mutable fields.
              updateData: {
                ...fields,
                scheduledAt: scheduled,
              },
              // No natural business key for a work order — always create a new
              // ticket when there's no existing external mapping.
              uniqueFieldConditions: [],
              artifactsData: undefined,
            };
          },
          onItemCreated: (id) => recordCreationActivity(id),
        },
        input,
        userId,
        integrationId,
        resource,
      );
    }),
});
