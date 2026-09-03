import "server-only";
import type { TransactionClient } from "@/lib/db";
import type { Briefing } from "./schema";

export async function persistBriefing(
  tx: TransactionClient,
  mitigationPlanId: string,
  content: Briefing,
) {
  return tx.planBriefing.upsert({
    where: { mitigationPlanId },
    create: { mitigationPlanId, content },
    update: { content },
  });
}
