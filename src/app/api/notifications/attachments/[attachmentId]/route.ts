import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { attachmentId } = await params;
  const attachment = await prisma.notificationAttachment.findUnique({
    where: { id: attachmentId },
    select: { downloadUrl: true, filename: true, contentType: true },
  });
  if (!attachment?.downloadUrl) {
    return new Response("Attachment not found", { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadBufferFromS3(
      keyFromDownloadUrl(attachment.downloadUrl),
    );
  } catch (err) {
    console.warn(`Attachment ${attachmentId} has no readable file:`, err);
    return new Response("Attachment not found", { status: 404 });
  }
  const safeFilename =
    (attachment.filename ?? "attachment").replace(/[^\w. -]/g, "") ||
    "attachment";
  const responseContentType =
    attachment.contentType &&
    /^[\w.+-]+\/[\w.+-]+$/.test(attachment.contentType)
      ? attachment.contentType
      : "application/octet-stream";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": responseContentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
