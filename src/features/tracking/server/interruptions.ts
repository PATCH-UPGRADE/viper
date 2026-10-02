import "server-only";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";

// What a clinician sees is decided here, from the signed-in user alone: their
// department → the assets it manages → those assets' device tickets. Drafts and
// DONE tickets are never shown.
const open = {
  isDraft: false,
  status: { not: TicketStatus.DONE },
} satisfies Prisma.WorkOrderTicketWhereInput;

export const getInterruptionCalendar = async (
  userId: string,
  range: { from: Date; to: Date },
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  if (!user?.departmentId) {
    return { scope: "no-department" as const, items: [] };
  }
  const managed = {
    managedBy: { some: { departmentId: user.departmentId } },
  } satisfies Prisma.AssetWhereInput;

  const rows = await prisma.assetTicket.findMany({
    where: {
      asset: managed,
      parentTicket: open,
      ticket: { ...open, scheduledAt: { gte: range.from, lte: range.to } },
    },
    orderBy: { ticket: { scheduledAt: "asc" } },
    select: {
      asset: { select: assetNameSelect },
      ticket: {
        select: { id: true, summary: true, status: true, scheduledAt: true },
      },
    },
  });

  // An empty week only means "no assets" if the department manages none.
  if (rows.length === 0) {
    const asset = await prisma.asset.findFirst({
      where: managed,
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
      assetName: getAssetDisplayName(asset),
    })),
  };
};
