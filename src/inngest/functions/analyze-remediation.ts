import "server-only";
import { persistMitigationPlans } from "@/features/inbox/agent/mitigation/persist";
import { triageNotification } from "@/features/inbox/agent/triage";
import { sortNotificationVulnerabilities } from "@/features/inbox/agent/vex";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest } from "../client";

type PreparedRemediation =
  | { skipped: "no-vulnerability" }
  | { notificationId: string; sourceId: string };

const REMEDIATION_SOURCE_CHANNEL = "TA4" as const;

async function findExistingSource(remediationId: string) {
  return prisma.notificationSource.findUnique({
    where: {
      channel_externalId: {
        channel: REMEDIATION_SOURCE_CHANNEL,
        externalId: remediationId,
      },
    },
    select: { id: true, notificationId: true },
  });
}

async function prepareRemediationNotification(
  remediationId: string,
): Promise<PreparedRemediation> {
  const remediation = await prisma.remediation.findUnique({
    where: { id: remediationId },
    select: { description: true, narrative: true, vulnerabilityId: true },
  });
  if (!remediation?.vulnerabilityId) return { skipped: "no-vulnerability" };
  const vulnerabilityId = remediation.vulnerabilityId;

  const existing = await findExistingSource(remediationId);
  if (existing?.notificationId) {
    return { notificationId: existing.notificationId, sourceId: existing.id };
  }

  const vuln = await prisma.vulnerability.findUnique({
    where: { id: vulnerabilityId },
    select: { cveId: true },
  });

  const title = `Update available for ${vuln?.cveId ?? "a tracked vulnerability"}`;
  const summary = remediation.description || remediation.narrative || null;
  const markdown = remediation.narrative || remediation.description || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: { type: "UpdateAvailable", title, summary },
      });
      const source = await tx.notificationSource.create({
        data: {
          channel: REMEDIATION_SOURCE_CHANNEL,
          externalId: remediationId,
          raw: { remediationId },
          markdown,
          notificationId: notification.id,
        },
      });
      await tx.notificationVulnerabilityMapping.create({
        data: {
          notificationId: notification.id,
          vulnerabilityId,
          confidence: "Matched",
          reasonWhy: "Vulnerability declared by the TA4 remediation.",
        },
      });
      await tx.notificationRemediationMapping.create({
        data: {
          notificationId: notification.id,
          remediationId,
          confidence: "Matched",
          reasonWhy: "Source remediation for this update.",
        },
      });
      return { notificationId: notification.id, sourceId: source.id };
    });
  } catch (e) {
    // A concurrent attempt already created the source — reuse its notification.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const raced = await findExistingSource(remediationId);
      if (raced?.notificationId) {
        return { notificationId: raced.notificationId, sourceId: raced.id };
      }
    }
    throw e;
  }
}

export const analyzeRemediation = inngest.createFunction(
  { id: "analyze-remediation" },
  { event: "remediation/analysis.requested" },
  async ({ event, step }) => {
    const { remediationId } = event.data as { remediationId: string };

    const prepared = await step.run("prepare-notification", () =>
      prepareRemediationNotification(remediationId),
    );
    if ("skipped" in prepared) {
      return { skipped: prepared.skipped, remediationId };
    }
    const { notificationId, sourceId } = prepared;

    const vexSummary = await step.run("sort-vulnerabilities", () =>
      sortNotificationVulnerabilities(notificationId),
    );

    await step.run("triage-notification", async () => {
      const result = await triageNotification(sourceId, notificationId);
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          priority: result.priority,
          priorityReasonWhy: result.priorityReasonWhy,
          hospitalImpact: result.hospitalImpact,
        },
      });
      return { priority: result.priority };
    });

    const mitigationSummary = await step.run("create-mitigation-plans", () =>
      persistMitigationPlans(sourceId, notificationId),
    );

    return {
      remediationId,
      notificationId,
      sourceId,
      vexSummary,
      mitigationSummary,
    };
  },
);
