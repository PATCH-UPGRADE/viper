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

const inScope = (departmentId: string): Prisma.AssetTicketWhereInput => ({
  asset: { managedBy: { some: { departmentId } } },
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
      asset: { select: assetNameSelect },
      ticket: {
        select: { id: true, summary: true, status: true, scheduledAt: true },
      },
    },
  });
  return rows.map(({ asset, ticket }) => ({
    id: ticket.id,
    summary: ticket.summary,
    status: ticket.status,
    // The query only returns tickets with a time.
    scheduledAt: ticket.scheduledAt as Date,
    assetName: getAssetDisplayName(asset),
  }));
};

// The comments on a device ticket in the user's scope. Anything else, such as
// another department's ticket or a work order's id, is NOT_FOUND.
export const getInterruptionComments = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  const ticket = departmentId
    ? await prisma.workOrderTicket.findFirst({
        where: { id, ticket: inScope(departmentId) },
        select: { comments: ticketDetailInclude.comments },
      })
    : null;
  if (!ticket) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  return ticket.comments;
};
