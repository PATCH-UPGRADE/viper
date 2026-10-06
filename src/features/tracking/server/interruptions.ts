import "server-only";
import { TRPCError } from "@trpc/server";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { plural } from "@/lib/utils";
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

// A device ticket this department manages, on an open work order.
const scopedDevice = (departmentId: string) =>
  ({
    asset: managedBy(departmentId),
    ticket: open,
  }) satisfies Prisma.AssetTicketWhereInput;

const inScope = (departmentId: string): Prisma.AssetTicketWhereInput => ({
  asset: managedBy(departmentId),
  parentTicket: open,
  ticket: open,
});

// The list is one row per device ticket. Duration, availability and "unread"
// belong to the owner ticket: a reader opens that, not every device ticket.
const itemSelect = (userId: string) =>
  ({
    parentTicketId: true,
    parentTicket: {
      select: {
        summary: true,
        durationEstimate: true,
        availability: true,
        seenBy: { where: { userId }, select: { userId: true } },
      },
    },
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
  }) satisfies Prisma.AssetTicketSelect;

type ItemRow = Prisma.AssetTicketGetPayload<{
  select: ReturnType<typeof itemSelect>;
}>;

const toItem = ({ parentTicketId, parentTicket, asset, ticket }: ItemRow) => ({
  id: ticket.id,
  summary: ticket.summary,
  status: ticket.status,
  category: ticket.category,
  scheduledAt: ticket.scheduledAt,
  unread: parentTicket.seenBy.length === 0,
  workOrderId: parentTicketId,
  workOrderSummary: parentTicket.summary,
  durationEstimate: parentTicket.durationEstimate,
  availability: parentTicket.availability,
  assetName: getAssetDisplayName(asset),
});

// A work order that owns device tickets ("owner ticket") is on the calendar at
// its own time, as "N devices". A device ticket only gets its own event when
// its time differs from its owner's, and never shows an unread dot.
export const getInterruptionCalendar = async (
  userId: string,
  range: { from: Date; to: Date },
) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) return [];

  const inRange = { scheduledAt: { gte: range.from, lte: range.to } };
  const [owners, devices] = await Promise.all([
    prisma.workOrderTicket.findMany({
      where: {
        ...open,
        ...inRange,
        assets: { some: scopedDevice(departmentId) },
      },
      select: {
        id: true,
        summary: true,
        status: true,
        category: true,
        scheduledAt: true,
        durationEstimate: true,
        availability: true,
        seenBy: { where: { userId }, select: { userId: true } },
        assets: { where: scopedDevice(departmentId), select: { id: true } },
      },
    }),
    prisma.assetTicket.findMany({
      where: { ...inScope(departmentId), ticket: { ...open, ...inRange } },
      select: {
        parentTicketId: true,
        parentTicket: {
          select: {
            summary: true,
            scheduledAt: true,
            durationEstimate: true,
            availability: true,
          },
        },
        asset: { select: assetNameSelect },
        ticket: {
          select: { id: true, status: true, category: true, scheduledAt: true },
        },
      },
    }),
  ]);
  // Both queries only return tickets with a time.
  return [
    ...owners.map((owner) => ({
      id: owner.id,
      workOrderId: owner.id,
      category: owner.category,
      summary: owner.summary,
      status: owner.status,
      scheduledAt: owner.scheduledAt as Date,
      durationEstimate: owner.durationEstimate,
      availability: owner.availability,
      unread: owner.seenBy.length === 0,
      assetName: `${owner.assets.length} ${plural("device", owner.assets.length)}`,
    })),
    ...devices
      .filter(
        ({ ticket, parentTicket }) =>
          ticket.scheduledAt?.getTime() !== parentTicket.scheduledAt?.getTime(),
      )
      .map(({ parentTicketId, parentTicket, asset, ticket }) => ({
        id: ticket.id,
        workOrderId: parentTicketId,
        category: ticket.category,
        summary: parentTicket.summary,
        status: ticket.status,
        scheduledAt: ticket.scheduledAt as Date,
        durationEstimate: parentTicket.durationEstimate,
        availability: parentTicket.availability,
        unread: false,
        assetName: getAssetDisplayName(asset),
      })),
  ];
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

// A work order's own details, and the devices it lists: only this
// department's, and never the one being viewed. Other departments' stay hidden.
const workOrderFields = (departmentId: string, id: string) =>
  ({
    id: true,
    body: true,
    descriptions: { where: { departmentId }, select: { body: true } },
    // Only this department's readers; other departments' users stay hidden.
    seenBy: {
      where: { user: { departmentId } },
      select: { user: { select: { name: true } } },
    },
    assets: {
      where: { ticketId: { not: id }, ...scopedDevice(departmentId) },
      select: {
        asset: { select: assetNameSelect },
        ticket: { select: { id: true, status: true, scheduledAt: true } },
      },
    },
  }) satisfies Prisma.WorkOrderTicketSelect;

// What the drawer shows beyond the card, for an owner ticket or a device ticket
// in the user's scope. Anything else is NOT_FOUND. A device ticket has no
// description of its own: it comes from its owner ticket.
export const getInterruptionDetail = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  const ticket = departmentId
    ? await prisma.workOrderTicket.findFirst({
        where: {
          id,
          OR: [
            { ticket: inScope(departmentId) },
            { ...open, assets: { some: scopedDevice(departmentId) } },
          ],
        },
        select: {
          ...workOrderFields(departmentId, id),
          category: true,
          assignee: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
          ticket: {
            select: {
              parentTicket: { select: workOrderFields(departmentId, id) },
            },
          },
          comments: ticketDetailInclude.comments,
          activities: ticketDetailInclude.activities,
        },
      })
    : null;
  if (!ticket) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  const workOrder = ticket.ticket?.parentTicket ?? ticket;
  return {
    comments: ticket.comments,
    activities: ticket.activities,
    seenBy: workOrder.seenBy,
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
