import "server-only";
import { TRPCError } from "@trpc/server";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { ticketDetailInclude } from "../types";

// What a clinician sees is decided here, from the signed-in user alone: their
// department → the assets it manages → those assets' device tickets. Drafts and
// DONE tickets are never shown.
const open = {
  isDraft: false,
  status: { not: TicketStatus.DONE },
} satisfies Prisma.WorkOrderTicketWhereInput;

const departmentOf = async (userId: string) =>
  (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    })
  )?.departmentId;

const managedBy = (departmentId: string) =>
  ({ managedBy: { some: { departmentId } } }) satisfies Prisma.AssetWhereInput;

const inScope = (departmentId: string): Prisma.AssetTicketWhereInput => ({
  asset: managedBy(departmentId),
  parentTicket: open,
  ticket: open,
});

const itemSelect = (userId: string) =>
  ({
    parentTicketId: true,
    parentTicket: {
      select: { summary: true, durationEstimate: true, availability: true },
    },
    asset: { select: assetNameSelect },
    ticket: {
      select: {
        id: true,
        summary: true,
        status: true,
        category: true,
        scheduledAt: true,
        seenBy: { where: { userId }, select: { userId: true } },
      },
    },
  }) satisfies Prisma.AssetTicketSelect;

type ItemRow = Prisma.AssetTicketGetPayload<{
  select: ReturnType<typeof itemSelect>;
}>;

// Duration and availability belong to the work order; every device shares them.
const toItem = ({ parentTicketId, parentTicket, asset, ticket }: ItemRow) => ({
  id: ticket.id,
  summary: ticket.summary,
  status: ticket.status,
  category: ticket.category,
  scheduledAt: ticket.scheduledAt,
  unread: ticket.seenBy.length === 0,
  workOrderId: parentTicketId,
  workOrderSummary: parentTicket.summary,
  durationEstimate: parentTicket.durationEstimate,
  availability: parentTicket.availability,
  assetName: getAssetDisplayName(asset),
});

export const getInterruptionCalendar = async (
  userId: string,
  range: { from: Date; to: Date },
) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) return [];

  const rows = await prisma.assetTicket.findMany({
    where: {
      AND: [
        inScope(departmentId),
        { ticket: { scheduledAt: { gte: range.from, lte: range.to } } },
      ],
    },
    select: itemSelect(userId),
  });
  // The query only returns tickets with a time.
  return rows.map((row) => ({
    ...toItem(row),
    scheduledAt: row.ticket.scheduledAt as Date,
  }));
};

export const getInterruptionList = async (userId: string) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) return [];

  const rows = await prisma.assetTicket.findMany({
    where: inScope(departmentId),
    orderBy: { ticket: { scheduledAt: { sort: "asc", nulls: "last" } } },
    take: 500,
    select: itemSelect(userId),
  });
  return rows.map(toItem);
};

// What the drawer shows beyond the card, for a device ticket in the user's
// scope. Anything else is NOT_FOUND. A device ticket has no description of
// its own: it comes from its work order.
export const getInterruptionDetail = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  const ticket = departmentId
    ? await prisma.workOrderTicket.findFirst({
        where: { id, ticket: inScope(departmentId) },
        select: {
          category: true,
          assignee: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
          ticket: {
            select: {
              parentTicket: {
                select: {
                  id: true,
                  body: true,
                  departments: { select: { id: true, name: true } },
                  disruption: true,
                  changesAfter: true,
                  descriptions: {
                    where: { departmentId },
                    select: { body: true },
                  },
                  // Only this department's other devices; others stay hidden.
                  assets: {
                    where: {
                      ticketId: { not: id },
                      asset: managedBy(departmentId),
                      ticket: open,
                    },
                    select: {
                      asset: { select: assetNameSelect },
                      ticket: {
                        select: { id: true, status: true, scheduledAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
          rescheduleRequests: {
            where: { requesterId: userId },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              suggestedAt: true,
              reason: true,
              note: true,
              createdAt: true,
            },
          },
          // Only this department's readers; other departments' users stay hidden.
          seenBy: {
            where: { user: { departmentId } },
            orderBy: { seenAt: "desc" },
            select: {
              seenAt: true,
              user: { select: { id: true, name: true, image: true } },
            },
          },
          comments: ticketDetailInclude.comments,
        },
      })
    : null;
  const workOrder = ticket?.ticket?.parentTicket;
  if (!ticket || !workOrder) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  return {
    comments: ticket.comments,
    seenBy: ticket.seenBy,
    rescheduleRequests: ticket.rescheduleRequests,
    category: ticket.category,
    workOrderId: workOrder.id,
    departments: workOrder.departments,
    viewerId: userId,
    disruption: workOrder.disruption,
    changesAfter: workOrder.changesAfter,
    contact: ticket.assignee ?? ticket.creator,
    why: workOrder.descriptions[0]?.body ?? workOrder.body ?? null,
    otherDevices: workOrder.assets.map(({ asset, ticket }) => ({
      id: ticket.id,
      name: getAssetDisplayName(asset),
      status: ticket.status,
      scheduledAt: ticket.scheduledAt,
    })),
  };
};

// A suggestion only: it is stored for the maintenance team and changes nothing
// on the tickets. Every device ticket must be in the user's scope.
export const requestReschedule = async (
  userId: string,
  input: { ticketId: string; suggestedAt: Date; reason: string; note?: string },
) => {
  const departmentId = await departmentOf(userId);
  const inScopeTicket = departmentId
    ? await prisma.assetTicket.findFirst({
        where: { ticketId: input.ticketId, ...inScope(departmentId) },
        select: { id: true },
      })
    : null;
  if (!inScopeTicket) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  return prisma.rescheduleRequest.create({
    data: { ...input, requesterId: userId },
  });
};
