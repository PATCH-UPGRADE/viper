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
