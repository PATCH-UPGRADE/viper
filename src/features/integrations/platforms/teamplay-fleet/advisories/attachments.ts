import "server-only";
import { z } from "zod";
import {
  type StoredAttachment,
  storeAttachmentBuffer,
} from "@/features/inbox/utils";
import type { Session } from "../../../core/types";
import {
  ADVISORY_ATTACHMENT_HOST,
  advisoryAttachmentsDownloadUrl,
} from "../urls";
import type { FleetAdvisoryAttachment, FleetAdvisoryItem } from "./advisories";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const PDF_FILE_TYPE = "pdf";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const downloadUrlSchema = z.object({ url: z.string() });

async function readCapped(
  res: Response,
  limit: number,
  label: string,
): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(`${label}` + `: declares ${declared} bytes`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error(`${label}: response had no body`);

  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`${label}` + `: exceeded ${limit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function resolveDownloadUrl(
  session: Session,
  externalId: string,
  fileType: string,
): Promise<string> {
  const res = await session.request(
    advisoryAttachmentsDownloadUrl(externalId, fileType),
  );
  if (!res.ok) {
    throw new Error(
      `Fleet advisory ${externalId} download-url (${fileType}) returned ${res.status}`,
    );
  }
  const parsed = downloadUrlSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Fleet advisory ${externalId} download-url returned no usable url`,
    );
  }
  return parsed.data.url;
}

const isAllowedDownloadUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.hostname === ADVISORY_ATTACHMENT_HOST
    );
  } catch {
    return false;
  }
};

/**
 * Fetch and store advisory's PDF
 */
export async function downloadAdvisoryPdfs(
  session: Session,
  item: FleetAdvisoryItem,
): Promise<StoredAttachment[]> {
  const pdfs = item.attachments.flatMap(
    (attachment: FleetAdvisoryAttachment) => {
      const type = attachment.type;
      return type && type.toLowerCase() === PDF_FILE_TYPE
        ? [{ ...attachment, type }]
        : [];
    },
  );

  const stored: StoredAttachment[] = [];

  for (const att of pdfs) {
    const url = await resolveDownloadUrl(session, item.vendorId, att.type);
    if (!url || !isAllowedDownloadUrl(url)) {
      throw new Error(`Fleet advisory ${item.vendorId}: refused download url`);
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(
        `Fleet advisory ${item.vendorId}: PDF download returned ${res.status}`,
      );
    const buffer = await readCapped(
      res,
      MAX_PDF_BYTES,
      `Fleet advisory ${item.vendorId}`,
    );

    stored.push(
      await storeAttachmentBuffer(buffer, {
        filename: att.name,
        contentType: "application/pdf",
        keyPrefix: `integrations/fleet/advisories/${item.vendorId}`,
      }),
    );
  }
  return stored;
}
