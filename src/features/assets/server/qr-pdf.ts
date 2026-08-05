import {
  type Color,
  PDFDocument,
  type PDFFont,
  rgb,
  StandardFonts,
} from "pdf-lib";
import QRCode from "qrcode";
import type { Prisma } from "@/generated/prisma";
import { deviceGroupLabel } from "@/lib/markdown";
import { getBaseUrl } from "@/lib/url-utils";
import { getAssetRoleLabel } from "../utils";

export const qrPdfAssetSelect = {
  id: true,
  role: true,
  serialNumber: true,
  deviceGroup: {
    select: {
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
    },
  },
} satisfies Prisma.AssetSelect;

type QrPdfAsset = Prisma.AssetGetPayload<{ select: typeof qrPdfAssetSelect }>;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 72;

const DARK = rgb(0.067, 0.094, 0.153);
const LINE_GRAY = rgb(0.216, 0.255, 0.318);
const GRAY = rgb(0.42, 0.447, 0.502);
const LIGHT_GRAY = rgb(0.612, 0.639, 0.686);
const BORDER_GRAY = rgb(0.898, 0.906, 0.922);

// Viper's mark: three parallel slanted bars, from public/logos/logo.svg (78x32 viewBox).
const LOGO_WIDTH = 78;
const LOGO_HEIGHT = 32;
const LOGO_PATHS = [
  { d: "M55.5 0H77.5L58.5 32H36.5L55.5 0Z", color: rgb(1, 0.478, 0) },
  { d: "M35.5 0H51.5L32.5 32H16.5L35.5 0Z", color: rgb(1, 0.592, 0.212) },
  { d: "M19.5 0H31.5L12.5 32H0.5L19.5 0Z", color: rgb(1, 0.737, 0.49) },
];

export async function renderAssetQrPdf(asset: QrPdfAsset): Promise<Buffer> {
  const url = `${getBaseUrl()}/assets/${asset.id}/work-orders`;
  const qrSize = 100;
  const qrPng = await QRCode.toBuffer(url, { margin: 1 });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);
  const qrImage = await pdfDoc.embedPng(qrPng);

  let y = PAGE_HEIGHT - 64;
  const drawText = (
    text: string,
    size: number,
    font: PDFFont,
    color: Color,
    lineHeight?: number,
  ) => page.drawText(text, { x: MARGIN_X, y, size, font, color, lineHeight });
  const drawDivider = () =>
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_WIDTH - MARGIN_X, y },
      thickness: 1,
      color: BORDER_GRAY,
    });

  y -= 28;
  drawText("Quick access to your equipment", 28, bold, DARK);
  y -= 32;

  drawText(url, 12, mono, LINE_GRAY);
  y -= 28;

  drawText(
    "Scan the QR code below to view this device's live status, open work orders, and service\nhistory in an instant.",
    12,
    font,
    GRAY,
    18,
  );
  y -= 50;

  const qrPad = 12;
  const qrBoxSize = qrSize + qrPad * 2;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - qrBoxSize,
    width: qrBoxSize,
    height: qrBoxSize,
    borderColor: BORDER_GRAY,
    borderWidth: 1,
  });
  page.drawImage(qrImage, {
    x: MARGIN_X + qrPad,
    y: y - qrBoxSize + qrPad,
    width: qrSize,
    height: qrSize,
  });
  y -= qrBoxSize + 24;

  drawText(getAssetRoleLabel(asset), 18, bold, DARK);
  y -= 22;

  drawText(deviceGroupLabel(asset.deviceGroup), 12, font, GRAY);
  y -= 24;

  drawDivider();
  y -= 24;

  if (asset.serialNumber) {
    drawText("SERIAL NUMBER", 9, bold, LIGHT_GRAY);
    y -= 15;
    drawText(asset.serialNumber, 12, bold, DARK);
    y -= 24;

    drawDivider();
    y -= 24;
  }

  drawText(
    "This document was generated automatically by Viper and reflects device data as of the date of creation.\nContact your IT administrator for the latest status.",
    9,
    font,
    LIGHT_GRAY,
    13,
  );

  const wordmarkWidth = bold.widthOfTextAtSize("Viper", 12);
  const logoScale = 0.5;
  const logoX =
    PAGE_WIDTH - MARGIN_X - LOGO_WIDTH * logoScale - 8 - wordmarkWidth;
  y -= 64;
  for (const { d, color } of LOGO_PATHS) {
    page.drawSvgPath(d, {
      x: logoX,
      y: y + LOGO_HEIGHT * logoScale,
      scale: logoScale,
      color,
    });
  }
  page.drawText("Viper", {
    x: logoX + LOGO_WIDTH * logoScale + 8,
    y: y + (LOGO_HEIGHT * logoScale - 12) / 2,
    size: 12,
    font: bold,
    color: DARK,
  });

  return Buffer.from(await pdfDoc.save());
}
