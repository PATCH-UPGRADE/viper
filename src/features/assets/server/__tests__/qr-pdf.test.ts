// @vitest-environment node
import { expect, it } from "vitest";
import { renderAssetQrPdf } from "../qr-pdf";

it("renders a PDF", async () => {
  const pdf = await renderAssetQrPdf({
    id: "asset_123",
    serialNumber: "SN-001",
    deviceGroup: {
      manufacturer: { canonicalDisplayName: "Acme" },
      product: {
        canonicalDisplayName: "Monitor",
        deviceType: { displayName: "Patient Monitor" },
      },
    },
  });

  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
});
