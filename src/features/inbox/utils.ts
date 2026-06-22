import "server-only";
import prisma from "@/lib/db";

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
          const res = await fetch(a.downloadUrl!);
          if (!res.ok) return null;
          const buffer = Buffer.from(await res.arrayBuffer());
          return { filename: a.filename, base64: buffer.toString("base64") };
        } catch {
          return null;
        }
      }),
  );

  return results.filter((a) => a !== null);
}
