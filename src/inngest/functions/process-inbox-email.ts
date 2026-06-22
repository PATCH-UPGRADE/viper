import "server-only";
import TurndownService from "turndown";
import { searchCandidates } from "@/features/inbox/agent/candidate-search";
import { classifyNotification } from "@/features/inbox/agent/classify";
import { extractEntities } from "@/features/inbox/agent/extract";
import { matchAndLinkEntities } from "@/features/inbox/agent/match";
import {
  checkEmailRelevance,
  stripHtml,
} from "@/features/inbox/agent/relevance";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { normalizeMd5, uploadBufferToS3 } from "@/lib/s3";
import { inngest } from "../client";

const turndown = new TurndownService();

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

    // 2. Check relevance (first X words of plain text)
    const WORD_COUNT = 1000;
    const plainText = email.text ?? stripHtml(email.html ?? "");
    const bodyPreview = plainText.split(/\s+/).slice(0, WORD_COUNT).join(" ");

    const { decision } = await step.run("check-relevance", () =>
      checkEmailRelevance({
        from: email.from,
        subject: email.subject,
        bodyPreview,
      }),
    );

    if (decision === "not_relevant") {
      return { skipped: true, emailId };
    }

    // 3. Upload attachments to S3
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
              console.warn(`Failed to download attachment ${att.id}`);
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

    // 4. Convert email HTML body to markdown
    const markdown = await step.run("html-to-markdown", async () => {
      if (email.html) return turndown.turndown(email.html);
      return email.text ?? null;
    });

    // 5. Persist NotificationSource + NotificationAttachment
    const sourceId = await step.run("save-source", async () => {
      // DEV: uncomment to reset duplicate so you can replay the same email webhook
      //await prisma.notificationSource.deleteMany({
      //  where: { externalId: emailId },
      //});

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
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
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

    // 6. Classify email and upsert Notification
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

    // 7. Extract entities (device groups) referenced in the notification
    const extracted = await step.run("extract-entities", () =>
      extractEntities(sourceId, {
        from: email.from,
        subject: email.subject,
        markdown: markdown ?? "",
      }),
    );

    // 8. Fuzzy-search the DB for matches and link/update/create them
    const linkSummary = await step.run("match-and-link-entities", async () => {
      if (
        !notificationId ||
        Object.values(extracted).every((v) => v.length === 0)
      ) {
        return { linked: 0, updated: 0, created: 0, skipped: 0 };
      }
      const candidates = await searchCandidates(extracted);
      return matchAndLinkEntities(notificationId, extracted, candidates);
    });

    return { sourceId, notificationId, emailId, linkSummary };
  },
);
