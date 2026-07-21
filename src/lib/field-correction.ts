import "server-only";
import type { CorrectionTargetType } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";

type Snapshot = Record<string, unknown>;

export async function recordFieldCorrections(
  tx: TransactionClient,
  params: {
    targetType: CorrectionTargetType;
    targetId: string;
    userId: string;
    reason?: string;
    before: Snapshot; // values read from the row BEFORE the update
    after: Snapshot; // the value set from the mutation
  },
): Promise<void> {
  const { targetType, targetId, userId, reason, before, after } = params;
  const changedFields = Object.keys(after).filter(
    (field) => after[field] !== undefined && after[field] !== before[field],
  );

  if (changedFields.length === 0) return;

  await tx.fieldCorrection.createMany({
    data: changedFields.map((field) => ({
      targetType,
      targetId,
      field,
      fromValue: (before[field] as Prisma.InputJsonValue) ?? null,
      toValue: (after[field] as Prisma.InputJsonValue) ?? null,
      reason,
      userId,
    })),
  });
}
