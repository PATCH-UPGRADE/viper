import "server-only";
import { AUTOMATION_USER_ID } from "@/config/constants";
import prisma from "@/lib/db";

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
