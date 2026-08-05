import fs from "node:fs";
import QRCode from "qrcode";
import type { Prisma } from "@/generated/prisma";
import { launchHeadlessBrowser } from "@/lib/headless-browser";
import { deviceGroupLabel } from "@/lib/markdown";
import { getBaseUrl } from "@/lib/url-utils";
import { getAssetRoleLabel } from "../utils";

export const qrPdfAssetSelect = {
  id: true,
  role: true,
  serialNumber: true,
  deviceGroup: {
    select: {
      vendor: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
    },
  },
} satisfies Prisma.AssetSelect;

type QrPdfAsset = Prisma.AssetGetPayload<{ select: typeof qrPdfAssetSelect }>;

const logoSvg = fs.readFileSync("public/logos/logo.svg", "utf-8");

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHtml(asset: QrPdfAsset, url: string, qrSvg: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 64px 72px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        color: #111827;
      }
      h1 {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 12px;
      }
      .url {
        font-family: "SF Mono", Menlo, Consolas, monospace;
        color: #374151;
        margin: 0 0 20px;
      }
      .description {
        color: #6b7280;
        max-width: 480px;
        line-height: 1.5;
        margin: 0 0 32px;
      }
      .qr {
        display: inline-block;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 32px;
      }
      .asset-name {
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 4px;
      }
      .device-label {
        color: #6b7280;
        margin: 0 0 24px;
      }
      .divider {
        border: none;
        border-top: 1px solid #e5e7eb;
        margin: 24px 0;
      }
      .serial-label {
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #9ca3af;
        margin: 0 0 4px;
      }
      .serial-value {
        font-weight: 700;
        margin: 0;
      }
      .footer {
        font-size: 11px;
        color: #9ca3af;
        line-height: 1.5;
        max-width: 420px;
      }
      .brand {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 12px;
      }
      .brand span {
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <h1>Quick access to your equipment</h1>
    <p class="url">${escapeHtml(url)}</p>
    <p class="description">
      Scan the QR code below to view this device's live status, open work
      orders, and service history in an instant.
    </p>
    <div class="qr">${qrSvg}</div>
    <p class="asset-name">${escapeHtml(getAssetRoleLabel(asset))}</p>
    <p class="device-label">${escapeHtml(deviceGroupLabel(asset.deviceGroup))}</p>
    <hr class="divider" />
    ${
      asset.serialNumber
        ? `<p class="serial-label">Serial Number</p>
    <p class="serial-value">${escapeHtml(asset.serialNumber)}</p>`
        : ""
    }
    <hr class="divider" />
    <p class="footer">
      This document was generated automatically by Viper and reflects device
      data as of the date of creation. Contact your IT administrator for the
      latest status.
    </p>
    <div class="brand">
      ${logoSvg}
      <span>Viper</span>
    </div>
  </body>
</html>`;
}

export async function renderAssetQrPdf(asset: QrPdfAsset): Promise<Buffer> {
  const url = `${getBaseUrl()}/assets/${asset.id}/work-orders`;
  const qrSvg = await QRCode.toString(url, { type: "svg", width: 250 });

  const browser = await launchHeadlessBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(asset, url, qrSvg));
    return await page.pdf({ printBackground: true });
  } finally {
    await browser.close();
  }
}
