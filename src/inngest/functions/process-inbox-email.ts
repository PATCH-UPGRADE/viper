import "server-only";
import TurndownService from "turndown";
import {
  checkEmailRelevance,
  stripHtml,
} from "@/features/inbox/agent/relevance";
import prisma from "@/lib/db";
import { uploadBufferToS3 } from "@/lib/s3";
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
            const key = `inbox/${emailId}/${crypto.randomUUID()}-${att.filename ?? att.id}`;
            const downloadUrl = await uploadBufferToS3(
              buffer,
              key,
              att.content_type ?? "application/octet-stream",
            );

            return {
              filename: att.filename,
              contentType: att.content_type,
              downloadUrl,
              size: buffer.length,
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
            })),
          },
        },
      });
      return source.id;
    });

    return { sourceId, emailId };
  },
);
