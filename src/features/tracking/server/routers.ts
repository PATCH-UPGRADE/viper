import "server-only";
import { z } from "zod";
import { type Prisma, TicketSource, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import { TRACKING_TABS } from "../params";
import { ticketBaseInclude, ticketDetailInclude } from "../types";

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
          { description: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

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
        const source = TicketSource.WORKFLOW;
        childTabWhere = { source };
        parentTabWhere = {
          OR: [{ source }, { children: { some: { source } } }],
        };
      } else if (tab === "my-department") {
        const me = await prisma.user.findUnique({
          where: { id: ctx.auth.user.id },
          select: { departmentId: true },
        });
        parentTabWhere = me?.departmentId
          ? { departmentId: me.departmentId }
          : { id: "__no_department__" };
      }

      const where: Prisma.WorkOrderTicketWhereInput = {
        AND: [{ parentId: null }, parentTabWhere, createSearchFilter(search)],
      };

      const totalCount = await prisma.workOrderTicket.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const tickets = await prisma.workOrderTicket.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        include: {
          ...ticketBaseInclude,
          children: {
            include: ticketBaseInclude,
            where: childTabWhere,
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      const items = tickets.map((t) => {
        const children = t.children.map((c) => ({
          ...c,
          linkedCount: ticketLinkedCount(c._count),
          commentCount: c._count.comments,
          linkedPreview: buildLinkedPreview(c),
        }));

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

        return {
          ...t,
          children,
          linkedCount: rolledLinked,
          commentCount: rolledComments,
          linkedPreview: rolledPreview,
        };
      });

      return createPaginatedResponse(items, meta);
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const ticket = await prisma.workOrderTicket.findUnique({
        where: { id: input.id },
        include: ticketDetailInclude,
      });
      return requireExistence(ticket, "Ticket");
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.ticketComment.create({
        data: {
          ticketId: input.ticketId,
          authorId: ctx.auth.user.id,
          body: input.body,
        },
      });
    }),
});
