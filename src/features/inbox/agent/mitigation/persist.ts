import "server-only";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";
import { createMitigationPlans } from ".";

// Run the mitigation-planning agent for a notification and persist its output:
// one MitigationPlan per plan (order 0 = recommended) plus its draft work orders
// (isDraft=true), each wired to the notification's linked vulns/remediations/
// device groups so an accepted plan yields fully-linked tickets.
export async function persistMitigationPlans(
  sourceId: string,
  notificationId: string,
) {
  // Never clobber a plan a human already accepted (its work orders are now real).
  const acceptedCount = await prisma.mitigationPlan.count({
    where: { notificationId, isAccepted: true },
  });
  if (acceptedCount > 0) return { skipped: "accepted-exists" as const };

  const vulnCount = await prisma.notificationVulnerabilityMapping.count({
    where: { notificationId },
  });
  if (vulnCount === 0) return { skipped: "no-vulnerabilities" as const };

  // Clear any stale, un-accepted plans first (cascades their draft work orders).
  await prisma.mitigationPlan.deleteMany({
    where: { notificationId, isAccepted: false },
  });

  const { plans } = await createMitigationPlans(sourceId, notificationId);
  if (plans.length === 0) return { plans: 0 };

  // TODO: (HEY!) don't just connect every single vulnerability, remediation, dg
  const [automation, vulnMappings, remMappings, dgMappings] = await Promise.all(
    [
      getAutomationUser(),
      prisma.notificationVulnerabilityMapping.findMany({
        where: { notificationId },
        select: { vulnerabilityId: true },
      }),
      prisma.notificationRemediationMapping.findMany({
        where: { notificationId, confidence: { not: "Rejected" } },
        select: { remediationId: true },
      }),
      prisma.notificationDeviceGroupMapping.findMany({
        where: { notificationId, confidence: { not: "Rejected" } },
        select: { deviceGroupMatchingId: true },
      }),
    ],
  );

  const vulnConnect = vulnMappings.map((m) => ({ id: m.vulnerabilityId }));
  const remConnect = remMappings.map((m) => ({ id: m.remediationId }));
  const deviceGroupCreate = dgMappings.map((m) => ({
    deviceGroupMatchingId: m.deviceGroupMatchingId,
    confidence: "NeedsReview" as const,
  }));

  for (const [order, plan] of plans.entries()) {
    await prisma.mitigationPlan.create({
      data: {
        notificationId,
        order,
        title: plan.title,
        summary: plan.summary,
        compareLine: plan.compareLine,
        tags: plan.tags,
        cards: plan.cards,
        workOrders: {
          create: plan.workOrders.map((w) => ({
            summary: w.shortDescription,
            body: w.detailedDescription,
            isDraft: true,
            creatorId: automation.id,
            vulnerabilities: { connect: vulnConnect },
            remediations: { connect: remConnect },
            deviceGroups: { create: deviceGroupCreate },
          })),
        },
      },
    });
  }

  return { plans: plans.length };
}
