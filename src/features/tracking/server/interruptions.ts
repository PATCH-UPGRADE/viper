import "server-only";
import { TRPCError } from "@trpc/server";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { requireExistence } from "@/trpc/middleware";
import { ticketDetailInclude } from "../types";

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

const ticketNotFound = () =>
  new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

// Only a device ticket the department manages. A parent work order's id, or
// another department's ticket, finds nothing.
const scopedTicketWhere = (
  departmentId: string,
  id: string,
): Prisma.WorkOrderTicketWhereInput => ({
  id,
  ...openTicket,
  ticket: inScope(departmentId),
});

/**
 * Throws NOT_FOUND unless this is an open (not DONE, not draft) device ticket
 * that the user's department manages.
 */
export const requireScopedTicket = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) throw ticketNotFound();
  const ticket = await prisma.workOrderTicket.findFirst({
    where: scopedTicketWhere(departmentId, id),
    select: { id: true },
  });
  if (!ticket) throw ticketNotFound();
};

// Only what the drawer shows. A remediation row also carries user ids and
// internal fields.
const remediationDumpSelect = {
  id: true,
  description: true,
  narrative: true,
  sourceImpact: true,
} satisfies Prisma.RemediationSelect;

export const getInterruptionDetail = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) throw ticketNotFound();

  const found = requireExistence(
    await prisma.workOrderTicket.findFirst({
      where: scopedTicketWhere(departmentId, id),
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        durationEstimate: true,
        remediations: { select: remediationDumpSelect },
        comments: ticketDetailInclude.comments,
        seenBy: {
          orderBy: { seenAt: "desc" },
          select: {
            seenAt: true,
            user: { select: { id: true, name: true } },
          },
        },
        ticket: {
          select: {
            asset: { select: assetNameSelect },
            parentTicket: {
              select: {
                summary: true,
                remediations: { select: remediationDumpSelect },
                assets: {
                  select: {
                    asset: {
                      select: {
                        ...assetNameSelect,
                        managedBy: {
                          where: { departmentId },
                          select: { id: true },
                        },
                      },
                    },
                    ticket: {
                      select: {
                        id: true,
                        status: true,
                        isDraft: true,
                        scheduledAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    "Ticket",
  );
  // The where clause guarantees a device ticket; this narrows the type.
  if (!found.ticket) throw ticketNotFound();
  const { asset, parentTicket: workOrder } = found.ticket;

  // The other devices on this work order: this department's are listed, the
  // rest only counted.
  const others = workOrder.assets.filter(
    (a) =>
      a.ticket.id !== found.id &&
      !a.ticket.isDraft &&
      a.ticket.status !== TicketStatus.DONE,
  );
  const mine = others.filter((a) => a.asset.managedBy.length > 0);

  return {
    id: found.id,
    status: found.status,
    scheduledAt: found.scheduledAt,
    durationEstimate: found.durationEstimate,
    workOrder: { summary: workOrder.summary },
    assetName: getAssetDisplayName(asset),
    otherDevices: mine
      .map((a) => ({
        id: a.ticket.id,
        name: getAssetDisplayName(a.asset),
        status: a.ticket.status,
        scheduledAt: a.ticket.scheduledAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    otherDepartmentDeviceCount: others.length - mine.length,
    remediations:
      found.remediations.length > 0
        ? found.remediations
        : workOrder.remediations,
    comments: found.comments,
    seenBy: found.seenBy,
  };
};
