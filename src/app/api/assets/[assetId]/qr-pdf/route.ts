import {
  qrPdfAssetSelect,
  renderAssetQrPdf,
} from "@/features/assets/server/qr-pdf";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";

type RouteParams = { params: Promise<{ assetId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { assetId } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: qrPdfAssetSelect,
  });
  if (!asset) {
    return new Response("Asset not found", { status: 404 });
  }

  return new Response(new Uint8Array(await renderAssetQrPdf(asset)), {
    headers: { "Content-Type": "application/pdf" },
  });
}
