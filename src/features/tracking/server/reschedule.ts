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
}
