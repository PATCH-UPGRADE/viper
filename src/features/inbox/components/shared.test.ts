// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  attachmentDownloadPath,
  emailSenderName,
  emailSubject,
  fileExtensionLabel,
  notificationActivityRows,
  nvdUrl,
} from "./shared";

describe("emailSenderName", () => {
  it("extracts the display name from a From header", () => {
    const raw = {
      data: { from: "Nephrotek Product Security <ps@nephrotek.com>" },
    };
    expect(emailSenderName(raw)).toBe("Nephrotek Product Security");
  });

  it("falls back to the bare address when the display name is empty", () => {
    expect(emailSenderName({ data: { from: "<ps@nephrotek.com>" } })).toBe(
      "ps@nephrotek.com",
    );
  });

  it("returns a From header that is only an address", () => {
    expect(emailSenderName({ data: { from: "ps@nephrotek.com" } })).toBe(
      "ps@nephrotek.com",
    );
  });

  it("strips the quotes email headers add around a name with a comma or period", () => {
    expect(
      emailSenderName({
        data: { from: '"Nephrotek Product Security, Inc." <ps@nephrotek.com>' },
      }),
    ).toBe("Nephrotek Product Security, Inc.");
  });

  it("falls back to the address when the quoted name is empty", () => {
    expect(emailSenderName({ data: { from: '"" <ps@nephrotek.com>' } })).toBe(
      "ps@nephrotek.com",
    );
  });

  it("returns null for payloads that are not emails", () => {
    expect(emailSenderName({ remediationId: "rem_1" })).toBeNull();
    expect(emailSenderName(null)).toBeNull();
    expect(emailSenderName({ data: {} })).toBeNull();
  });
});

describe("emailSubject", () => {
  it("reads the subject from an email payload", () => {
    expect(
      emailSubject({ data: { subject: "SSA-016040: Insecure Password" } }),
    ).toBe("SSA-016040: Insecure Password");
  });

  it("distinguishes two messages from the same sender", () => {
    const from = "Nephrotek Product Security <ps@nephrotek.com>";
    const first = { data: { from, subject: "Advisory NPT-PSA-2026-014" } };
    const second = { data: { from, subject: "Follow-up: corrected firmware" } };
    expect(emailSenderName(first)).toBe(emailSenderName(second));
    expect(emailSubject(first)).not.toBe(emailSubject(second));
  });

  it("returns null when there is no subject to show", () => {
    expect(emailSubject({ remediationId: "rem_1" })).toBeNull();
    expect(emailSubject({ data: {} })).toBeNull();
    expect(emailSubject(null)).toBeNull();
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

  it("treats a dot inside the name as part of the name, not an extension", () => {
    expect(fileExtensionLabel("Advisory v1.2 final")).toBe("FILE");
    expect(fileExtensionLabel("Siemens Rel. 4 notice")).toBe("FILE");
  });

  it("reads the last extension of a double-extension name", () => {
    expect(fileExtensionLabel("report.tar.gz")).toBe("GZ");
  });
});

describe("notificationActivityRows", () => {
  const user = { id: "u1", name: "Alice", image: null };
  const notification = {
    sourceLinks: [
      {
        sourceType: "Source" as const,
        reasonWhy: null,
        createdAt: new Date("2026-08-06T21:12:00Z"),
        sourceRecord: {
          id: "s1",
          channel: "Email" as const,
          raw: {
            data: { from: "Nephrotek Product Security <ps@nephrotek.com>" },
          },
        },
      },
      {
        sourceType: "Link" as const,
        reasonWhy: "Same advisory, firmware build now available.",
        createdAt: new Date("2026-08-07T09:00:00Z"),
        sourceRecord: { id: "s2", channel: "TA4" as const, raw: {} },
      },
    ],
    fieldCorrections: [
      {
        id: "f1",
        field: "priority",
        fromValue: "Critical",
        toValue: "High",
        reason: "Machines are already segmented.",
        createdAt: new Date("2026-08-08T10:00:00Z"),
        user,
      },
    ],
  };

  it("turns the first source link into a created row named after the sender", () => {
    expect(notificationActivityRows(notification)).toContainEqual({
      kind: "NOTIFICATION_CREATED",
      id: "source-s1",
      createdAt: new Date("2026-08-06T21:12:00Z"),
      sourceLabel: "Nephrotek Product Security",
      reasonWhy: null,
    });
  });

  it("turns a Link source into a linked row that keeps the agent's reason and falls back to the channel", () => {
    expect(notificationActivityRows(notification)).toContainEqual({
      kind: "SOURCE_LINKED",
      id: "source-s2",
      createdAt: new Date("2026-08-07T09:00:00Z"),
      sourceLabel: "TA4",
      reasonWhy: "Same advisory, firmware build now available.",
    });
  });

  it("turns a field correction into a field change row that carries who made it", () => {
    const rows = notificationActivityRows(notification);
    expect(rows).toContainEqual({
      kind: "FIELD_CHANGED",
      id: "correction-f1",
      createdAt: new Date("2026-08-08T10:00:00Z"),
      field: "priority",
      from: "Critical",
      to: "High",
      reason: "Machines are already segmented.",
      user,
    });
    expect(rows).toHaveLength(3);
  });
});
