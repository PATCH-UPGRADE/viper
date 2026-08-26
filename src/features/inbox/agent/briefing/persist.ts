import "server-only";
import prisma from "@/lib/db";
import type { Briefing } from "./schema";

export async function persistBriefing(
  mitigationPlanId: string,
  content: Briefing,
) {
  return prisma.planBriefing.upsert({
    where: { mitigationPlanId },
    create: { mitigationPlanId, content },
    update: { content },
  });
}
