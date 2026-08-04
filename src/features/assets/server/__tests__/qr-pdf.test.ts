import fs from "node:fs";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { getBaseUrl } from "@/lib/url-utils";
import {
  buildWorkOrdersQrUrl,
  type QrPdfAsset,
  renderAssetQrPdf,
} from "../qr-pdf";

describe("buildWorkOrdersQrUrl", () => {
  it("points at the asset's work-orders page", () => {
    const assetId = "asset_123";
    expect(buildWorkOrdersQrUrl(assetId)).toBe(
      `${getBaseUrl()}/assets/${assetId}/work-orders`,
    );
  });
});

const hasChromium = fs.existsSync(chromium.executablePath());

describe.skipIf(!hasChromium)("renderAssetQrPdf", () => {
  it("renders a real PDF", async () => {
    const asset: QrPdfAsset = {
      id: "asset_123",
      role: "ICU Monitor",
      serialNumber: "SN-001",
      deviceGroup: {
        vendor: { canonicalDisplayName: "Acme" },
        product: { canonicalDisplayName: "Monitor" },
      },
    };

    const pdf = await renderAssetQrPdf(asset);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
