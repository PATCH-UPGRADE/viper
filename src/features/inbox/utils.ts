import "server-only";
import prisma from "@/lib/db";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

/**
 * Fetch all PDF attachments for a NotificationSource and return them as
 * base64-encoded buffers, ready to be passed to Claude as `document` blocks.
 * Attachments that fail to download are skipped.
 */
export async function fetchPdfAttachments(
  sourceId: string,
): Promise<Array<{ filename: string | null; base64: string }>> {
  const attachments = await prisma.notificationAttachment.findMany({
    where: { sourceId },
    select: { downloadUrl: true, contentType: true, filename: true },
  });

  const results = await Promise.all(
    attachments
      .filter(
        (a) =>
          (a.contentType?.startsWith("application/pdf") ||
            a.filename?.toLowerCase().endsWith(".pdf")) &&
          a.downloadUrl !== null,
      )
      .map(async (a) => {
        try {
          const key = keyFromDownloadUrl(a.downloadUrl!);
          const buffer = await downloadBufferFromS3(key);
          return { filename: a.filename, base64: buffer.toString("base64") };
        } catch (err) {
          console.warn(
            `Failed to download attachment for source ${sourceId}:`,
            err,
          );
          return null;
        }
      }),
  );

  return results.filter((a) => a !== null);
}
