import "server-only";
import prisma from "@/lib/db";

// Fixed id for the single service account that owns automatically-ingested
// records (e.g. work-order tickets created from forwarded emails). Using a
// stable id makes find-or-create idempotent and keeps provenance clear.
export const AUTOMATION_USER_ID = "viper-automation";

/**
 * Find-or-create the VIPER Automation service user. Used as `creatorId` for
 * tickets the system creates on a human's behalf (the human, if any, is
 * recorded separately, e.g. in `suggestedAssignee`).
 */
export async function getAutomationUser() {
  return prisma.user.upsert({
    where: { id: AUTOMATION_USER_ID },
    create: { id: AUTOMATION_USER_ID, name: "VIPER Automation" },
    update: {},
  });
}
