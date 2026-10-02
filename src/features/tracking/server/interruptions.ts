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
    select: {
      parentTicketId: true,
      asset: { select: assetNameSelect },
      ticket: {
        select: {
          id: true,
          summary: true,
          status: true,
          category: true,
          scheduledAt: true,
        },
      },
    },
  });
  return rows.map(({ parentTicketId, asset, ticket }) => ({
    id: ticket.id,
    workOrderId: parentTicketId,
    category: ticket.category,
    summary: ticket.summary,
    status: ticket.status,
    // The query only returns tickets with a time.
    scheduledAt: ticket.scheduledAt as Date,
    assetName: getAssetDisplayName(asset),
  }));
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
          // Only this department's readers; other departments' users stay hidden.
          seenBy: {
            where: { user: { departmentId } },
            select: { user: { select: { name: true } } },
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
    category: ticket.category,
    workOrderId: workOrder.id,
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
