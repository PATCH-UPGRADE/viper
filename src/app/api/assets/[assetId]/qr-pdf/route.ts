import {
  qrPdfAssetSelect,
  renderAssetQrPdf,
} from "@/features/assets/server/qr-pdf";
import { getAssetRoleLabel } from "@/features/assets/utils";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
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

  const pdf = await renderAssetQrPdf(asset);
  const filename = `${getAssetRoleLabel(asset)
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}-work-orders.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
