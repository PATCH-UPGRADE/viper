import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type Prisma, TicketCategory, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createSortParser, fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import { TRACKING_TABS } from "../params";
import {
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
  recordUpdateActivities,
  snapshotBeforeUpdate,
} from "./activities";

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
  advisories: number;
  assets: number;
}) =>
  count.issues +
  count.vulnerabilities +
  count.remediations +
  count.advisories +
  count.assets;

const buildLinkedPreview = (ticket: {
  vulnerabilities: { id: string; cveId: string | null }[];
  assets: { id: string; hostname: string | null }[];
}) => [
  ...ticket.vulnerabilities.map((v) => ({
    id: v.id,
    label: v.cveId ?? v.id,
  })),
  ...ticket.assets.map((a) => ({
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
      let childTabWhere: Prisma.WorkOrderTicketWhereInput | undefined;

      if (tab === "requires-approval") {
        const status = TicketStatus.REQUIRES_APPROVAL;
        childTabWhere = { status };
        // Show a parent if it matches OR any of its children matches.
        parentTabWhere = {
          OR: [{ status }, { children: { some: { status } } }],
        };
      } else if (tab === "suggested") {
        // "Suggested" surfaces auto-ingested tickets — those with a source
        // artifact (email/integration) rather than a user creating it by hand.
        const ingested = { sources: { some: {} } };
        childTabWhere = ingested;
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
        AND: [{ parentId: null }, parentTabWhere, createSearchFilter(search)],
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
            where: childTabWhere,
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
          "Return a paginated set of work-order tickets matching the given filters, with linked entities (assets, vulnerabilities, advisories, remediations) included.",
      },
    })
    .output(paginatedWorkOrderListResponseSchema)
    .query(async ({ input, ctx }) => {
      const { search, departmentIds, assigneeIds } = input;
      const filters: Prisma.WorkOrderTicketWhereInput[] = [
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
        status: z.nativeEnum(TicketStatus).optional(),
        category: z.nativeEnum(TicketCategory).optional(),
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
        select: { _count: { select: { children: true } } },
      });
      if (!child) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      if (child._count.children > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot attach a ticket that already has sub-tickets",
        });
      }
      return prisma.$transaction(async (tx) => {
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
          select: { parentId: true },
        });
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
      // Eligible candidates: any ticket other than the current parent that
      // doesn't already have sub-tickets of its own (we keep the tree flat
      // since the UI only renders one level of children).
      const tickets = await prisma.workOrderTicket.findMany({
        where: {
          id: { not: input.parentId },
          children: { none: {} },
        },
        select: {
          id: true,
          summary: true,
          status: true,
          parent: { select: { id: true, summary: true } },
        },
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
          "Link an existing asset to the given work-order ticket via the many-to-many relation. Returns the updated ticket detail.",
      },
    })
    .output(workOrderDetailResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.workOrderTicket.update({
          where: { id: input.ticketId },
          data: { assets: { connect: { id: input.assetId } } },
        });
        await recordAssetActivity(
          tx,
          input.ticketId,
          ctx.auth.user.id,
          input.assetId,
          "attached",
        );
        // Re-fetch so activities and the just-attached asset are in the
        // response.
        const refetched = await tx.workOrderTicket.findUniqueOrThrow({
          where: { id: updated.id },
          include: {
            ...ticketDetailInclude,
            ...watchedBy(ctx.auth.user.id),
          },
        });
        return withIsWatching(refetched);
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
        const updated = await tx.workOrderTicket.update({
          where: { id: input.ticketId },
          data: { assets: { disconnect: { id: input.assetId } } },
        });
        await recordAssetActivity(
          tx,
          input.ticketId,
          ctx.auth.user.id,
          input.assetId,
          "detached",
        );
        const refetched = await tx.workOrderTicket.findUniqueOrThrow({
          where: { id: updated.id },
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
          workOrderTickets: { none: { id: input.ticketId } },
        },
        select: {
          id: true,
          hostname: true,
          ip: true,
          role: true,
          deviceGroup: {
            select: {
              vendor: { select: { canonicalDisplayName: true } },
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
      const now = new Date();
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
          data: { lastCommentAt: now },
        });
        return comment;
      });
    }),
});
