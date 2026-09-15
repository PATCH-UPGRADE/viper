import type { SourceChannel, SourceLinkType } from "@/generated/prisma";
import type { RawEmailPayload } from "../types";

export function emailSenderName(raw: unknown): string | null {
  const from = (raw as RawEmailPayload | null)?.data?.from;
  if (!from) return null;
  const quotedDisplayName = from.split("<")[0]?.trim() ?? "";
  const displayName = quotedDisplayName.replace(/^"(.*)"$/, "$1").trim();
  const bareAddress = from
    .replace(/^[^<]*</, "")
    .replace(/[<>]/g, "")
    .trim();
  return displayName || bareAddress || null;
}

export function emailSubject(raw: unknown): string | null {
  return (raw as RawEmailPayload | null)?.data?.subject ?? null;
}

export function nvdUrl(cveId: string): string {
  return `https://nvd.nist.gov/vuln/detail/${cveId}`;
}

export function attachmentDownloadPath(attachmentId: string): string {
  return `/api/notifications/attachments/${attachmentId}`;
}

export function fileExtensionLabel(filename: string | null): string {
  const extension = filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return extension ? extension.toUpperCase() : "FILE";
}

type ActivityActor = { id: string; name: string | null; image: string | null };

export type NotificationActivityRow =
  | {
      kind: "NOTIFICATION_CREATED" | "SOURCE_LINKED";
      id: string;
      createdAt: Date;
      sourceLabel: string;
      reasonWhy: string | null;
    }
  | {
      kind: "FIELD_CHANGED";
      id: string;
      createdAt: Date;
      field: string;
      from: string | null;
      to: string;
      reason: string | null;
      user: ActivityActor;
      isAgent: boolean;
    };

type ActivitySource = {
  sourceType: SourceLinkType;
  reasonWhy: string | null;
  createdAt: Date;
  sourceRecord: { id: string; channel: SourceChannel; raw: unknown };
};

type ActivityCorrection = {
  id: string;
  field: string;
  fromValue: unknown;
  toValue: unknown;
  reason: string | null;
  createdAt: Date;
  user: ActivityActor;
  isAgent: boolean;
};

const sourceRow = (link: ActivitySource): NotificationActivityRow => ({
  kind: link.sourceType === "Source" ? "NOTIFICATION_CREATED" : "SOURCE_LINKED",
  id: `source-${link.sourceRecord.id}`,
  createdAt: new Date(link.createdAt),
  sourceLabel:
    emailSenderName(link.sourceRecord.raw) ?? link.sourceRecord.channel,
  reasonWhy: link.reasonWhy,
});

const fieldChangeRow = (
  correction: ActivityCorrection,
): NotificationActivityRow => ({
  kind: "FIELD_CHANGED",
  id: `correction-${correction.id}`,
  createdAt: new Date(correction.createdAt),
  field: correction.field,
  from: correction.fromValue == null ? null : String(correction.fromValue),
  to: String(correction.toValue ?? ""),
  reason: correction.reason,
  user: correction.user,
  isAgent: correction.isAgent,
});

export function notificationActivityRows(notification: {
  sourceLinks: ActivitySource[];
  fieldCorrections: ActivityCorrection[];
}): NotificationActivityRow[] {
  const sourceRows = notification.sourceLinks.map(sourceRow);
  const fieldChangeRows = notification.fieldCorrections.map(fieldChangeRow);
  return [...sourceRows, ...fieldChangeRows];
}
