import "server-only";
import type { GetStepTools } from "inngest";
import type { inngest } from "@/inngest/client";
import type { PdfAttachment } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { classifyNotification } from "./agent/classify";
import { persistMitigationPlans } from "./agent/mitigation/persist";
import type { InboundEmail } from "./agent/prompt";
import { generateQuestionForNotification } from "./agent/question";
import { triageNotification } from "./agent/triage";
import { sortNotificationVulnerabilities } from "./agent/vex";
import type { KnownNotificationFields } from "./source-adapter";

/**
 * The slice of Inngest's `step` this pipeline uses.
 *
 * Taken from Inngest's own type rather than hand-written: `step.run` returns a
 * `Jsonify` of what the handler returned, and a hand-written signature that
 * claims otherwise changes the types every caller downstream sees.
 */
export type PipelineStep = Pick<GetStepTools<typeof inngest>, "run">;

/**
 * Attach the entities a document refers to, once its Notification exists.
 *
 * The caller owns this and its step ids, because how the links are found
 * differs by source. An email names its devices in prose and needs two LLM
 * passes to find them. A feed that states the manufacturer and product outright
 * resolves them with a lookup instead.
 */
export type LinkEntities = (
  step: PipelineStep,
  /**
   * Nullable because `step.run` reports the classifier's optional id as null.
   * Every stage here guards on it rather than assuming the classifier ran.
   */
  notificationId: string | null,
) => Promise<unknown>;

export interface NotificationPipelineInput {
  step: PipelineStep;
  /** A SourceRecord that is already persisted. */
  sourceId: string;
  /** Sender, subject and body, whatever the source called them. */
  doc: InboundEmail;
  attachments?: PdfAttachment[];
  linkEntities: LinkEntities;
  /** What the source stated for itself. Overrides the classifier. */
  known?: KnownNotificationFields;
}

/**
 * Turn a stored SourceRecord into a linked, triaged Notification.
 *
 * Every stage below the link step reads what it needs from the database by id,
 * so this runs identically whether the source was an inbound email or a channel
 * poll. Step ids are part of the contract: Inngest replays a run by id, so
 * renaming one strands the runs already in flight.
 */
export async function runNotificationPipeline({
  step,
  sourceId,
  doc,
  attachments,
  linkEntities,
  known,
}: NotificationPipelineInput) {
  const notificationId = await step.run("classify-notification", async () => {
    const result = await classifyNotification(sourceId, doc, attachments);

    // A marking the source printed beats one the model read out of the prose.
    const tlp = known?.tlp ?? result.tlp;

    if (result.action === "update") {
      await prisma.notification.update({
        where: { id: result.notificationId },
        data: {
          type: result.type,
          title: result.title,
          summary: result.summary,
          ...(tlp ? { tlp } : {}),
          sourceLinks: {
            create: {
              sourceRecordId: sourceId,
              sourceType: "Link",
              reasonWhy: result.reasonWhy,
            },
          },
        },
      });

      return result.notificationId;
    }

    const notification = await prisma.notification.create({
      data: {
        type: result.type,
        title: result.title,
        summary: result.summary,
        ...(tlp ? { tlp } : {}),
        sourceLinks: {
          create: { sourceRecordId: sourceId, sourceType: "Source" },
        },
      },
    });
    return notification.id;
  });

  const linkSummary = await linkEntities(step, notificationId);

  // VEX sort: if the notification has linked vulnerabilities, sort each
  // baseline Issue into at-risk / possibly-at-risk / unaffected. Runs before
  // triage so priority/hospital-impact reasoning can reflect the results.
  const vexSummary = await step.run("sort-vulnerabilities", async () => {
    if (!notificationId) return { vexSkipped: true as const };
    const vulnCount = await prisma.notificationVulnerabilityMapping.count({
      where: { notificationId },
    });
    if (vulnCount === 0) return { vexSkipped: true as const };
    return sortNotificationVulnerabilities(notificationId);
  });

  // run question and mitigation steps in parallel
  const [questionSummary, , mitigationSummary] = await Promise.all([
    // Generate questions for any Issue VEX just left UNDER_INVESTIGATION
    step.run("generate-questions", async () => {
      if (!notificationId || !vexSummary)
        return { questionSkipped: true as const };
      if ("vexSkipped" in vexSummary && vexSummary.vexSkipped)
        return { questionSkipped: true as const };
      return generateQuestionForNotification(
        sourceId,
        notificationId,
        attachments,
      );
    }),
    // Triage: assign priority, reason, and hospital impact
    step.run("triage-notification", async () => {
      if (!notificationId) return { skipped: true as const };

      const result = await triageNotification(
        sourceId,
        notificationId,
        attachments,
      );
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          priority: result.priority,
          priorityReasonWhy: result.priorityReasonWhy,
          hospitalImpact: result.hospitalImpact,
        },
      });
      return {
        priority: result.priority,
        priorityReasonWhy: result.priorityReasonWhy,
      };
    }),
    // Mitigation plans: if the notification has linked vulnerabilities,
    // propose ordered remediation plans and materialize each as a plan plus its
    // draft work orders (isDraft=true; accepting a plan promotes them).
    step.run("create-mitigation-plans", async () => {
      if (!notificationId) return null;
      return persistMitigationPlans(sourceId, notificationId, attachments);
    }),
  ]);

  return {
    notificationId,
    linkSummary,
    vexSummary,
    mitigationSummary,
    questionSummary,
  };
}
