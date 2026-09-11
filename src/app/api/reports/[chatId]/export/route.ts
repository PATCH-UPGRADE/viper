// Plain route handler, not tRPC — needs to set Content-Disposition on a binary download.
import { renderReportDocx } from "@/features/reports/server/report-docx";
import { renderReportPdf } from "@/features/reports/server/report-pdf";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";

const FORMATS = {
  pdf: {
    contentType: "application/pdf",
    render: renderReportPdf,
  },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    render: renderReportDocx,
  },
} as const;

const slug = (title: string | null) =>
  (
    title
      ?.replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "report"
  ).toLowerCase();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  if (!Object.hasOwn(FORMATS, format)) {
    return new Response("Unknown format", { status: 400 });
  }
  const spec = FORMATS[format as keyof typeof FORMATS];

  const { chatId } = await params;
  const thread = await prisma.chatThread.findFirst({
    where: { id: chatId, userId: session.user.id },
    select: { title: true, report: { select: { content: true } } },
  });
  if (!thread?.report?.content) {
    return new Response("Report not found", { status: 404 });
  }

  const buffer = await spec.render(thread.report.content);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": spec.contentType,
      "Content-Disposition": `attachment; filename="${slug(thread.title)}.${format}"`,
      // Contains patient/facility data — keep it out of shared/disk caches.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
