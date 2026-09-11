import "server-only";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";
import { recordFieldCorrections } from "@/lib/field-correction";
import type { TriageResult } from ".";

export async function persistTriageResult(
  notificationId: string,
  result: TriageResult,
): Promise<void> {
  const automation = await getAutomationUser();
  await prisma.$transaction(async (tx) => {
    const before = await tx.notification.findUniqueOrThrow({
      where: { id: notificationId },
      select: { priority: true },
    });
    await tx.notification.update({
      where: { id: notificationId },
      data: {
        priority: result.priority,
        priorityReasonWhy: result.priorityReasonWhy,
        hospitalImpact: result.hospitalImpact,
      },
    });
    await recordFieldCorrections(tx, {
      targetType: "Notification",
      targetId: notificationId,
      userId: automation.id,
      reason: result.priorityReasonWhy,
      before: { priority: before.priority },
      after: { priority: result.priority },
    });
  });
}
