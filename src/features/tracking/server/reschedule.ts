import "server-only";
import type { TransactionClient } from "@/lib/db";

// VW-556 will also update the time on the external platform from here.
export async function applyReschedule(
  tx: TransactionClient,
  ticketId: string,
  scheduledAt: Date,
): Promise<void> {
  const ticket = await tx.workOrderTicket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { scheduledAt: true, scheduledEndTime: true },
  });
  const { scheduledAt: from, scheduledEndTime: end } = ticket;
  await tx.workOrderTicket.update({
    where: { id: ticketId },
    data: {
      scheduledAt,
      ...(from &&
        end && {
          scheduledEndTime: new Date(
            end.getTime() + scheduledAt.getTime() - from.getTime(),
          ),
        }),
    },
  });
  // Device tickets still on the old time move with it. The calendar shows a
  // device on its own only when its time differs from its work order's.
  await tx.workOrderTicket.updateMany({
    where: { parentId: ticketId, ticket: { isNot: null }, scheduledAt: from },
    data: { scheduledAt },
  });
}
