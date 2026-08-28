// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  attachmentDownloadPath,
  emailSenderName,
  fileExtensionLabel,
  nvdUrl,
} from "./shared";

describe("emailSenderName", () => {
  it("extracts the display name from a From header", () => {
    const raw = {
      data: { from: "Nephrotek Product Security <ps@nephrotek.com>" },
    };
    expect(emailSenderName(raw)).toBe("Nephrotek Product Security");
  });

  it("falls back to the bare address when there is no display name", () => {
    expect(emailSenderName({ data: { from: "<ps@nephrotek.com>" } })).toBe(
      "ps@nephrotek.com",
    );
    expect(emailSenderName({ data: { from: "ps@nephrotek.com" } })).toBe(
      "ps@nephrotek.com",
    );
  });

  it("returns null for payloads that are not emails", () => {
    expect(emailSenderName({ remediationId: "rem_1" })).toBeNull();
    expect(emailSenderName(null)).toBeNull();
    expect(emailSenderName({ data: {} })).toBeNull();
  });
});

describe("nvdUrl", () => {
  it("builds the NVD detail link for a CVE id", () => {
    expect(nvdUrl("CVE-2026-31847")).toBe(
      "https://nvd.nist.gov/vuln/detail/CVE-2026-31847",
    );
  });
});

describe("attachmentDownloadPath", () => {
  it("builds the download route path for an attachment id", () => {
    expect(attachmentDownloadPath("att_1")).toBe(
      "/api/notifications/attachments/att_1",
    );
  });
});

describe("fileExtensionLabel", () => {
  it("uppercases the filename extension", () => {
    expect(fileExtensionLabel("NPT-PSA-2026-014_Advisory.pdf")).toBe("PDF");
  });

  it("falls back to FILE when there is no extension", () => {
    expect(fileExtensionLabel("advisory")).toBe("FILE");
    expect(fileExtensionLabel(null)).toBe("FILE");
  });
});
