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

// A device ticket the department manages, and still open.
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
  if (!departmentId) return { scope: "no-department" as const, items: [] };

  const rows = await prisma.assetTicket.findMany({
    where: {
      AND: [
        inScope(departmentId),
        { ticket: { scheduledAt: { gte: range.from, lte: range.to } } },
      ],
    },
    orderBy: { ticket: { scheduledAt: "asc" } },
    select: {
      asset: { select: assetNameSelect },
      ticket: {
        select: {
          id: true,
          summary: true,
          status: true,
          scheduledAt: true,
          durationEstimate: true,
        },
      },
    },
  });

  // An empty week only means "no assets" if the department manages none.
  if (rows.length === 0) {
    const asset = await prisma.asset.findFirst({
      where: managedBy(departmentId),
      select: { id: true },
    });
    if (!asset) return { scope: "no-assets" as const, items: [] };
  }

  return {
    scope: "ready" as const,
    items: rows.map(({ asset, ticket }) => ({
      id: ticket.id,
      summary: ticket.summary,
      status: ticket.status,
      // The query only returns tickets with a time.
      scheduledAt: ticket.scheduledAt as Date,
      durationEstimate: ticket.durationEstimate,
      assetName: getAssetDisplayName(asset),
    })),
  };
};

// A device ticket carries no description or remediation of its own: those come
// from its work order. Only these remediation fields are sent, not the whole row.
const departmentDescription = (departmentId: string) => ({
  where: { departmentId },
  select: { body: true },
});
const remediationSelect = {
  id: true,
  description: true,
  narrative: true,
  sourceImpact: true,
} satisfies Prisma.RemediationSelect;

// What the drawer shows beyond the card, for a device ticket in the user's
// scope. Anything else, such as another department's ticket or a work order's
// id, is NOT_FOUND.
export const getInterruptionDetail = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  const ticket = departmentId
    ? await prisma.workOrderTicket.findFirst({
        where: { id, ticket: inScope(departmentId) },
        select: {
          body: true,
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
          descriptions: departmentDescription(departmentId),
          remediations: { select: remediationSelect },
          ticket: {
            select: {
              parentTicket: {
                select: {
                  descriptions: departmentDescription(departmentId),
                  remediations: { select: remediationSelect },
                },
              },
            },
          },
          comments: ticketDetailInclude.comments,
        },
      })
    : null;
  if (!ticket) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  const workOrder = ticket.ticket?.parentTicket;
  return {
    comments: ticket.comments,
    contactName: ticket.assignee?.name ?? ticket.creator.name,
    // The department's own words first, then the work order's, then the body.
    whyNecessary:
      [
        ticket.descriptions[0]?.body,
        workOrder?.descriptions[0]?.body,
        ticket.body,
      ].find((text) => text?.trim()) ?? null,
    remediations:
      ticket.remediations.length > 0
        ? ticket.remediations
        : (workOrder?.remediations ?? []),
  };
};
