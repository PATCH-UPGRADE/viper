// Resend webhook -> our api -> this process-inbox-email Inngest function
// Turns an email into a Notification or a Work Order ticket, if relevant

import "server-only";
import TurndownService from "turndown";
import { searchCandidates } from "@/features/inbox/agent/candidate-search";
import { classifyNotification } from "@/features/inbox/agent/classify";
import { classifyEmailKind } from "@/features/inbox/agent/classify-kind";
import { extractEntities } from "@/features/inbox/agent/extract";
import { extractWorkOrder } from "@/features/inbox/agent/extract-work-order";
import { matchAndLinkEntities } from "@/features/inbox/agent/match";
import { persistMitigationPlans } from "@/features/inbox/agent/mitigation/persist";
import { triageNotification } from "@/features/inbox/agent/triage";
import { sortNotificationVulnerabilities } from "@/features/inbox/agent/vex";
import { fetchPdfAttachmentsFromResend, isPdf } from "@/features/inbox/utils";
import { Prisma } from "@/generated/prisma";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";
import { normalizeMd5, uploadBufferToS3 } from "@/lib/s3";
import { inngest } from "../client";

const turndown = new TurndownService();

// Parse an LLM-provided date string, treating anything unparseable as absent.
function parseScheduledAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const processInboxEmail = inngest.createFunction(
  { id: "process-inbox-email" },
  { event: "inbox/email.received" },
  async ({ event, step }) => {
    const { emailId, raw } = event.data as {
      emailId: string;
      raw: Record<string, unknown>;
    };

    // 1. Fetch full email content from Resend
    const email = await step.run("fetch-email-content", async () => {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data)
        throw new Error(error?.message ?? "Failed to fetch email");
      return data;
    });

    // 2. Convert email HTML body to markdown (every downstream agent reads it)
    const markdown = await step.run("html-to-markdown", async () => {
      if (email.html) return turndown.turndown(email.html);
      return email.text ?? null;
    });

    // 3. Triage: is this relevant at all, and if so is it an informational
    // Notification or an actionable Work Order?
    const { kind } = await step.run("classify-email-kind", async () => {
      const pdfAttachments = await fetchPdfAttachmentsFromResend(
        emailId,
        email.attachments ?? [],
      );
      return classifyEmailKind(
        {
          from: email.from,
          subject: email.subject,
          markdown: markdown ?? "",
        },
        pdfAttachments,
      );
    });

    if (kind === "not_relevant") {
      return { skipped: true, emailId };
    }

    // 4. Upload attachments to S3
    const uploadedAttachments = await step.run(
      "upload-attachments",
      async () => {
        if (!email.attachments?.length) return [];

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        return Promise.all(
          email.attachments.map(async (att) => {
            // Get the time-limited download URL from Resend
            const { data: attData, error } =
              await resend.emails.receiving.attachments.get({
                emailId,
                id: att.id,
              });
            if (error || !attData?.download_url) {
              console.warn(`Skipping attachment ${att.id}: ${error?.message}`);
              return null;
            }

            const res = await fetch(attData.download_url);
            if (!res.ok) {
              const detail = `${res.status} ${await res.text()}`;
              // If there's a pdf that we can't download, just throw an error
              // Chances are all relevant context is there
              if (
                isPdf({ filename: att.filename, contentType: att.content_type })
              ) {
                throw new Error(
                  `Failed to download PDF attachment ${att.id}: ${detail}`,
                );
              }
              console.warn(
                `Failed to download attachment ${att.id}: ${detail}`,
              );
              return null;
            }

            const buffer = Buffer.from(await res.arrayBuffer());
            const { createHash } = await import("node:crypto");
            const hashHex = createHash("md5").update(buffer).digest("hex");

            const existing = await prisma.notificationAttachment.findFirst({
              where: { hash: hashHex },
              select: { downloadUrl: true },
            });

            if (existing?.downloadUrl) {
              return {
                filename: att.filename,
                contentType: att.content_type,
                downloadUrl: existing.downloadUrl,
                size: buffer.length,
                hash: hashHex,
              };
            }

            const key = `inbox/${emailId}/${crypto.randomUUID()}-${att.filename ?? att.id}`;
            const downloadUrl = await uploadBufferToS3(
              buffer,
              key,
              att.content_type ?? "application/octet-stream",
              normalizeMd5(hashHex),
            );

            return {
              filename: att.filename,
              contentType: att.content_type,
              downloadUrl,
              size: buffer.length,
              hash: hashHex,
            };
          }),
        ).then((results) => results.filter(Boolean));
      },
    );

    // 5. Persist NotificationSource + NotificationAttachment
    const sourceId = await step.run("save-source", async () => {
      // DEV: uncomment to reset duplicate so you can replay the same email webhook
      // await prisma.notificationSource.deleteMany({
      //  where: { externalId: emailId },
      // });

      try {
        const source = await prisma.notificationSource.create({
          data: {
            channel: "Email",
            externalId: emailId,
            raw,
            markdown,
            attachments: {
              create: (
                uploadedAttachments as NonNullable<
                  (typeof uploadedAttachments)[number]
                >[]
              ).map((a) => ({
                filename: a.filename ?? null,
                contentType: a.contentType ?? null,
                downloadUrl: a.downloadUrl,
                size: a.size,
                hash: a.hash ?? null,
              })),
            },
          },
        });
        return source.id;
      } catch (e) {
        // TODO: Consider also adding a hash to deduplicate emails?
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" // unique-constraint
        ) {
          console.log(
            `NotificationSource already exists for emailId=${emailId}, skipping`,
          );
          return null;
        }
        throw e;
      }
    });

    if (!sourceId) return { skipped: true, reason: "duplicate", emailId };

    // 6w. Work-order path: extract fields, create the ticket linked to this
    // email source, then tag matched device groups onto the ticket.
    if (kind === "work_order") {
      const wo = await step.run("extract-work-order", () =>
        extractWorkOrder(sourceId, {
          from: email.from,
          subject: email.subject,
          markdown: markdown ?? "",
        }),
      );

      const workOrderTicketId = await step.run(
        "create-work-order",
        async () => {
          const automation = await getAutomationUser();

          // Match extracted department names to existing departments
          // case-insensitively (the table is small; never auto-create).
          const wanted = new Set(
            wo.departmentNames.map((n) => n.trim().toLowerCase()),
          );
          const departmentIds = wanted.size
            ? (
                await prisma.department.findMany({
                  select: { id: true, name: true },
                })
              )
                .filter((d) => wanted.has(d.name.toLowerCase()))
                .map((d) => d.id)
            : [];

          const ticket = await prisma.workOrderTicket.create({
            data: {
              summary: wo.summary,
              body: markdown,
              category: wo.category,
              scheduledAt: parseScheduledAt(wo.scheduledAt),
              suggestedAssignee: wo.suggestedAssignee,
              sourceLabel: email.from,
              creatorId: automation.id,
              departments: {
                connect: departmentIds.map((id) => ({ id })),
              },
              // Links the email NotificationSource to this ticket (sets its
              // workOrderTicketId; notificationId stays null).
              sources: { connect: { id: sourceId } },
            },
          });
          return ticket.id;
        },
      );

      const extracted = await step.run("extract-work-order-entities", () =>
        extractEntities(sourceId, {
          from: email.from,
          subject: email.subject,
          markdown: markdown ?? "",
        }),
      );

      const linkSummary = await step.run(
        "match-work-order-entities",
        async () => {
          if (Object.values(extracted).every((v) => v.length === 0)) {
            return { linked: 0, updated: 0, created: 0, skipped: 0 };
          }
          const candidates = await searchCandidates(extracted);
          return matchAndLinkEntities(
            { workOrderTicketId },
            extracted,
            candidates,
          );
        },
      );

      return { workOrderTicketId, sourceId, emailId, linkSummary };
    }

    // 7. Classify email and upsert Notification
    const notificationId = await step.run("classify-notification", async () => {
      const result = await classifyNotification(sourceId, {
        from: email.from,
        subject: email.subject,
        markdown: markdown ?? "",
      });

      if (result.action === "update") {
        await prisma.$transaction(async (tx) => {
          await tx.notification.update({
            where: { id: result.notificationId },
            data: {
              type: result.type,
              title: result.title,
              summary: result.summary,
              ...(result.tlp !== null ? { tlp: result.tlp } : {}),
              sources: { connect: { id: sourceId } },
            },
          });

          await tx.notificationSource.update({
            where: { id: sourceId },
            data: { sourceType: "Link", reasonWhy: result.reasonWhy },
          });
        });
        return result.notificationId;
      }

      const notification = await prisma.notification.create({
        data: {
          type: result.type,
          title: result.title,
          summary: result.summary,
          ...(result.tlp !== null ? { tlp: result.tlp } : {}),
          sources: { connect: { id: sourceId } },
        },
      });
      return notification.id;
    });

    // 8. Extract entities (device groups) referenced in the notification
    const extracted = await step.run("extract-entities", () =>
      extractEntities(sourceId, {
        from: email.from,
        subject: email.subject,
        markdown: markdown ?? "",
      }),
    );

    // 9. Fuzzy-search the DB for matches and link/update/create them
    const linkSummary = await step.run("match-and-link-entities", async () => {
      if (
        !notificationId ||
        Object.values(extracted).every((v) => v.length === 0)
      ) {
        return { linked: 0, updated: 0, created: 0, skipped: 0 };
      }
      const candidates = await searchCandidates(extracted);
      return matchAndLinkEntities({ notificationId }, extracted, candidates);
    });

    // 10. VEX sort: if the notification has linked vulnerabilities, sort each
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

    // 11. Triage: assign priority, reason, and hospital impact
    if (notificationId) {
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
      });
    }

    // 12. Mitigation plans: if the notification has linked vulnerabilities,
    // propose ordered remediation plans and materialize each as a plan plus its
    // draft work orders (isDraft=true; accepting a plan promotes them).
    const mitigationSummary = notificationId
      ? await step.run("create-mitigation-plans", () =>
          persistMitigationPlans(sourceId, notificationId),
        )
      : null;

    return {
      sourceId,
      notificationId,
      emailId,
      linkSummary,
      vexSummary,
      mitigationSummary,
    };
  },
);
