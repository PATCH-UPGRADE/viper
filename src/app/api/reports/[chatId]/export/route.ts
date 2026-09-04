import { renderReportDocx } from "@/features/reports/server/report-docx";
import { renderReportPdf } from "@/features/reports/server/report-pdf";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";

export const runtime = "nodejs";

const FORMATS = {
  pdf: {
    contentType: "application/pdf",
    ext: "pdf",
    render: renderReportPdf,
  },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
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
  const spec = FORMATS[format as keyof typeof FORMATS];
  if (!spec) {
    return new Response("Unknown format", { status: 400 });
  }

  const { chatId } = await params;
  const thread = await prisma.chatThread.findFirst({
    where: { id: chatId, userId: session.user.id },
    select: { title: true, report: true },
  });
  if (!thread?.report) {
    return new Response("Report not found", { status: 404 });
  }

  const buffer = await spec.render(thread.title, thread.report);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": spec.contentType,
      "Content-Disposition": `attachment; filename="${slug(thread.title)}.${spec.ext}"`,
    },
  });
}
