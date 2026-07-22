import "server-only";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";
import { existingIds, keepValidIds } from "../../utils";
import { createMitigationPlans } from ".";
import type { PlanWorkOrder } from "./schema";

// Run the mitigation-planning agent for a notification and persist its output:
// one MitigationPlan per plan
// Skip if any mitigation plans have already been accepted
// Otherwise delete un-accepted plans first
// Return number of plans created + work order links that could not be created
export async function persistMitigationPlans(
  sourceId: string,
  notificationId: string,
) {
  const acceptedCount = await prisma.mitigationPlan.count({
    where: { notificationId, isAccepted: true },
  });
  if (acceptedCount > 0) return { skipped: "accepted-exists" as const };

  const vulnCount = await prisma.notificationVulnerabilityMapping.count({
    where: { notificationId },
  });
  if (vulnCount === 0) return { skipped: "no-vulnerabilities" as const };

  await prisma.mitigationPlan.deleteMany({
    where: { notificationId, isAccepted: false },
  });

  const { plans } = await createMitigationPlans(sourceId, notificationId);
  if (plans.length === 0) return { plans: 0 };

  const [automation, valid] = await Promise.all([
    getAutomationUser(),
    resolveValidIds(plans.flatMap((p) => p.workOrders)),
  ]);

  let dropped = 0;
  const linksFor = (w: PlanWorkOrder) => {
    const vulnerabilityIds = keepValidIds(
      w.vulnerabilityIds,
      valid.vulnerability,
    );
    const remediationIds = keepValidIds(w.remediationIds, valid.remediation);
    const deviceGroupIds = keepValidIds(
      w.deviceGroups.map((d) => d.id),
      valid.deviceGroupMatching,
    );
    dropped +=
      w.vulnerabilityIds.length -
      vulnerabilityIds.length +
      (w.remediationIds.length - remediationIds.length) +
      (w.deviceGroups.length - deviceGroupIds.length);

    return {
      vulnerabilities: { connect: vulnerabilityIds.map((id) => ({ id })) },
      remediations: { connect: remediationIds.map((id) => ({ id })) },
      deviceGroups: {
        create: deviceGroupIds.map((id) => {
          const d = w.deviceGroups.find((g) => g.id === id);
          return {
            deviceGroupMatchingId: id,
            confidence: d?.confidence ?? ("NeedsReview" as const),
            reasonWhy: d?.reasonWhy ?? null,
          };
        }),
      },
    };
  };

  await prisma.$transaction(
    plans.map((plan, order) =>
      prisma.mitigationPlan.create({
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
              notificationId,
              ...linksFor(w),
            })),
          },
        },
      }),
    ),
  );

  if (dropped > 0) {
    console.warn(
      `persistMitigationPlans: dropped ${dropped} unknown/duplicate entity id(s) for notification ${notificationId}`,
    );
  }

  return { plans: plans.length, droppedLinks: dropped };
}

/** Which of the ids the agent named still exist, per entity type. */
async function resolveValidIds(workOrders: PlanWorkOrder[]) {
  const [vulnerability, remediation, deviceGroupMatching] = await Promise.all([
    existingIds(
      (args) => prisma.vulnerability.findMany(args),
      workOrders.flatMap((w) => w.vulnerabilityIds),
    ),
    existingIds(
      (args) => prisma.remediation.findMany(args),
      workOrders.flatMap((w) => w.remediationIds),
    ),
    existingIds(
      (args) => prisma.deviceGroupMatching.findMany(args),
      workOrders.flatMap((w) => w.deviceGroups.map((d) => d.id)),
    ),
  ]);
  return { vulnerability, remediation, deviceGroupMatching };
}
