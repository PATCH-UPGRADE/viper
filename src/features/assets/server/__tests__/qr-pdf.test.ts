import { expect, it } from "vitest";
import { escapeHtml, renderAssetQrPdf } from "../qr-pdf";

it("renders a safe PDF", async () => {
  expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");

  const pdf = await renderAssetQrPdf({
    id: "asset_123",
    role: "ICU Monitor",
    serialNumber: "SN-001",
    deviceGroup: {
      vendor: { canonicalDisplayName: "Acme" },
      product: { canonicalDisplayName: "Monitor" },
    },
  });

  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
}, 30_000);
