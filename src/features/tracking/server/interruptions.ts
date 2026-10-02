import "server-only";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";

// The device ticket (an AssetTicket's child) is the unit here. Scope comes from
// the signed-in user's department alone, never from the client: user →
// department → ManagesRelationship → assets → AssetTicket → device ticket.
// `openTicket` (no drafts, no DONE) is part of every scope query.

export type InterruptionScope = "no-department" | "no-assets" | "ready";

const openTicket = {
  isDraft: false,
  status: { not: TicketStatus.DONE },
} satisfies Prisma.WorkOrderTicketWhereInput;

const managedBy = (departmentId: string) =>
  ({ managedBy: { some: { departmentId } } }) satisfies Prisma.AssetWhereInput;

const inScope = (departmentId: string): Prisma.AssetTicketWhereInput => ({
  asset: managedBy(departmentId),
  ticket: openTicket,
  parentTicket: openTicket,
});

const departmentOf = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  return user?.departmentId ?? null;
};

// Only asked when a query comes back empty, to tell "manages nothing" from
// "nothing scheduled".
const managesAssets = async (departmentId: string) =>
  (await prisma.asset.findFirst({
    where: managedBy(departmentId),
    select: { id: true },
  })) !== null;

const seenSelect = (userId: string) =>
  ({
    lastCommentAt: true,
    seenBy: { where: { userId }, select: { seenAt: true } },
  }) satisfies Prisma.WorkOrderTicketSelect;

// Unread means the user has never opened the ticket, or a comment landed after
// they last did. The tracking table's own indicator only covers the second
// case, which would leave a never-opened ticket looking read.
const isUnread = (t: {
  lastCommentAt: Date | null;
  seenBy: { seenAt: Date }[];
}) => {
  const seenAt = t.seenBy[0]?.seenAt;
  return !seenAt || (t.lastCommentAt !== null && t.lastCommentAt > seenAt);
};

export type InterruptionTicket = {
  id: string;
  parentId: string;
  summary: string;
  status: TicketStatus;
  scheduledAt: Date | null;
  durationEstimate: number | null;
  assetName: string;
  unread: boolean;
};

const ticketRowSelect = (userId: string) =>
  ({
    parentTicketId: true,
    asset: { select: assetNameSelect },
    ticket: {
      select: {
        id: true,
        summary: true,
        status: true,
        scheduledAt: true,
        durationEstimate: true,
        ...seenSelect(userId),
      },
    },
  }) satisfies Prisma.AssetTicketSelect;

const toTicket = (
  row: Prisma.AssetTicketGetPayload<{
    select: ReturnType<typeof ticketRowSelect>;
  }>,
): InterruptionTicket => ({
  id: row.ticket.id,
  parentId: row.parentTicketId,
  summary: row.ticket.summary,
  status: row.ticket.status,
  scheduledAt: row.ticket.scheduledAt,
  durationEstimate: row.ticket.durationEstimate,
  assetName: getAssetDisplayName(row.asset),
  unread: isUnread(row.ticket),
});

const byTime = (a: InterruptionTicket, b: InterruptionTicket) =>
  (a.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY) -
  (b.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY);

export type InterruptionCalendarItem = InterruptionTicket & {
  scheduledAt: Date;
};

export const getInterruptionCalendar = async (
  userId: string,
  range: { from: Date; to: Date },
) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) {
    return { scope: "no-department" as const, items: [], assetTicketCount: 0 };
  }

  const rows = await prisma.assetTicket.findMany({
    where: {
      AND: [
        inScope(departmentId),
        { ticket: { scheduledAt: { gte: range.from, lte: range.to } } },
      ],
    },
    select: ticketRowSelect(userId),
  });

  if (rows.length === 0 && !(await managesAssets(departmentId))) {
    return { scope: "no-assets" as const, items: [], assetTicketCount: 0 };
  }

  // The query only returns tickets with a time, so the cast is safe.
  const items = (rows.map(toTicket) as InterruptionCalendarItem[]).sort(byTime);

  return { scope: "ready" as const, items, assetTicketCount: items.length };
};
