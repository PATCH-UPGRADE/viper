import type { RawEmailPayload } from "../types";

export function emailSenderName(raw: unknown): string | null {
  const from = (raw as RawEmailPayload | null)?.data?.from;
  if (!from) return null;
  const displayName = from.split("<")[0]?.trim();
  const bareAddress = from.replace(/[<>]/g, "").trim();
  return displayName || bareAddress || null;
}

export function nvdUrl(cveId: string): string {
  return `https://nvd.nist.gov/vuln/detail/${cveId}`;
}

export function attachmentDownloadPath(attachmentId: string): string {
  return `/api/notifications/attachments/${attachmentId}`;
}

export function fileExtensionLabel(filename: string | null): string {
  const extension = filename?.includes(".") ? filename.split(".").pop() : null;
  return extension ? extension.toUpperCase() : "FILE";
}
