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

  const buffer = await downloadBufferFromS3(
    keyFromDownloadUrl(attachment.downloadUrl),
  );
  const safeFilename =
    (attachment.filename ?? "attachment").replace(/[^\w. -]/g, "") ||
    "attachment";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
