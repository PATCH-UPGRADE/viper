import "server-only";
import type { PdfAttachment } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { normalizeName } from "@/lib/router-utils";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

const isPdf = (a: {
  filename?: string | null;
  contentType?: string | null;
}): boolean =>
  Boolean(
    a.contentType?.toLowerCase().startsWith("application/pdf") ||
      a.filename?.toLowerCase().endsWith(".pdf"),
  );

/**
 * Ceiling on the summed Resend-reported `size` of an email's PDFs for them to
 * be carried through Inngest step state instead of re-fetched from S3.
 *
 * Resend does not document the unit, so we assume the worst case (decoded
 * bytes). Base64 inflates ~4/3, and the encoded string is what rides in the
 * step output, which Inngest caps at 4MiB — so 3MB here lands at ~4MB encoded.
 */
export const INLINE_ATTACHMENT_BUDGET = 3_000_000;

type ResendAttachmentMeta = {
  filename?: string | null;
  content_type?: string | null;
  size?: number | null;
};

/** A PDF carried through step state, keyed back to its Resend attachment. */
export type InlinePdfAttachment = PdfAttachment & { id: string };

/**
 * Whether an email's PDFs are small enough to pass through step state. An
 * attachment with no reported size is treated as too big — the S3 fallback is
 * always correct, so unknowns resolve that way.
 */
export function pdfsFitInlineBudget(
  attachments: ResendAttachmentMeta[],
): boolean {
  const pdfs = attachments.filter((a) =>
    isPdf({ filename: a.filename, contentType: a.content_type }),
  );
  if (pdfs.length === 0) return true;
  if (pdfs.some((a) => typeof a.size !== "number")) return false;

  const total = pdfs.reduce((sum, a) => sum + (a.size ?? 0), 0);
  return total <= INLINE_ATTACHMENT_BUDGET;
}

/**
 * Fetch an inbound email's PDF attachments straight from Resend, as base64
 * `document` blocks. Used by the triage gate, which runs before we upload to
 * S3 or write a NotificationSource and so cannot use `fetchPdfAttachments`
 *
 * `complete` is false when any PDF failed to download. Callers must not pass a
 * partial set downstream — the missing PDF would be silently absent, where the
 * S3 fallback might still have retrieved it.
 */
export async function fetchPdfAttachmentsFromResend(
  emailId: string,
  attachments: Array<{
    id: string;
    filename?: string | null;
    content_type?: string | null;
  }>,
): Promise<{ pdfs: InlinePdfAttachment[]; complete: boolean }> {
  const pdfs = attachments.filter((a) =>
    isPdf({ filename: a.filename, contentType: a.content_type }),
  );
  if (pdfs.length === 0) return { pdfs: [], complete: true };

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const results = await Promise.all(
    pdfs.map(async (a) => {
      try {
        const { data, error } = await resend.emails.receiving.attachments.get({
          emailId,
          id: a.id,
        });
        if (error || !data?.download_url) return null;

        const res = await fetch(data.download_url);
        if (!res.ok) return null;

        const buffer = Buffer.from(await res.arrayBuffer());
        return {
          id: a.id,
          filename: a.filename ?? null,
          base64: buffer.toString("base64"),
        };
      } catch (err) {
        console.warn(`Failed to download attachment ${a.id}:`, err);
        return null;
      }
    }),
  );

  const downloaded = results.filter((a) => a !== null);
  return { pdfs: downloaded, complete: downloaded.length === pdfs.length };
}

/**
 * Fetch all PDF attachments for a NotificationSource and return them as
 * base64-encoded buffers, ready to be passed to Claude as `document` blocks.
 * Attachments that fail to download are skipped.
 */
export async function fetchPdfAttachments(
  sourceId: string,
): Promise<Array<{ filename: string | null; base64: string }>> {
  const attachments = await prisma.notificationAttachment.findMany({
    where: { sourceId },
    select: { downloadUrl: true, contentType: true, filename: true },
  });

  const results = await Promise.all(
    attachments
      .filter((a) => isPdf(a) && a.downloadUrl !== null)
      .map(async (a) => {
        try {
          const key = keyFromDownloadUrl(a.downloadUrl!);
          const buffer = await downloadBufferFromS3(key);
          return { filename: a.filename, base64: buffer.toString("base64") };
        } catch (err) {
          console.warn(
            `Failed to download attachment for source ${sourceId}:`,
            err,
          );
          return null;
        }
      }),
  );

  return results.filter((a) => a !== null);
}

// Similiar to resolveDeviceGroup except it doesn't create. From
// Notification mentioning an identifier isn't evidence the hospital owns the device
// creating one from notification would pollute inventory
export async function enrichDeviceGroupIdentifiers(
  identity: {
    vendorId: string;
    productId: string | null;
    versionId: string | null;
  },
  updates: { cpe?: string | null; udi?: string | null },
): Promise<void> {
  const deviceGroup = await prisma.deviceGroup.findFirst({
    where: {
      vendorId: identity.vendorId,
      productId: identity.productId,
      versionId: identity.versionId,
    },
  });
  if (!deviceGroup) return;

  const mergedCpes = updates.cpe
    ? [...new Set([...deviceGroup.cpe, updates.cpe])]
    : deviceGroup.cpe;
  const needsCpe = mergedCpes.length !== deviceGroup.cpe.length;
  const needsUdi = !!updates.udi && !deviceGroup.udi;
  if (!needsCpe && !needsUdi) return;

  await prisma.deviceGroup.update({
    where: { id: deviceGroup.id },
    data: {
      ...(needsCpe ? { cpe: mergedCpes } : {}),
      ...(needsUdi ? { udi: updates.udi } : {}),
    },
  });
}

export async function enrichVulnerabilityCvss(
  vulnerabilityId: string,
  updates: {
    cvssScore?: number | null;
    cvssVector?: string | null;
  },
): Promise<void> {
  const vulnerability = await prisma.vulnerability.findUnique({
    where: { id: vulnerabilityId },
    select: { cvssScore: true, cvssVector: true },
  });

  if (!vulnerability) return;

  const needsScore =
    updates.cvssScore !== null && vulnerability.cvssScore === null;
  const needsVector = !!updates.cvssVector && !vulnerability.cvssVector;

  if (!needsScore && !needsVector) return;

  await prisma.vulnerability.update({
    where: { id: vulnerabilityId },
    data: {
      ...(needsScore ? { cvssScore: updates.cvssScore } : {}),
      ...(needsVector ? { cvssVector: updates.cvssVector } : {}),
    },
  });
}

export async function enrichAssetIdentifiers(
  assetId: string,
  updates: { macAddress?: string | null; serialNumber?: string | null },
): Promise<void> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { macAddress: true, serialNumber: true },
  });
  if (!asset) return;

  const needsMac = !!updates.macAddress && !asset.macAddress;
  const needsSerial = !!updates.serialNumber && !asset.serialNumber;
  if (!needsMac && !needsSerial) return;
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      ...(needsMac ? { macAddress: updates.macAddress } : {}),
      ...(needsSerial ? { serialNumber: updates.serialNumber } : {}),
    },
  });
}

export async function addVendorAlias(id: string, alias: string): Promise<void> {
  const normalized = normalizeName(alias);
  const row = await prisma.vendor.findUnique({
    where: { id },
    select: { canonicalName: true, nameMappings: true },
  });

  if (!row) return;
  if (
    normalized === row.canonicalName ||
    row.nameMappings.includes(normalized)
  ) {
    return;
  }
  await prisma.vendor.update({
    where: { id },
    data: { nameMappings: { push: normalized } },
  });
}

export async function addProductAlias(
  id: string,
  alias: string,
): Promise<void> {
  const normalized = normalizeName(alias);
  const row = await prisma.product.findUnique({
    where: { id },
    select: { canonicalName: true, nameMappings: true },
  });

  if (!row) return;
  if (
    normalized === row.canonicalName ||
    row.nameMappings.includes(normalized)
  ) {
    return;
  }
  await prisma.product.update({
    where: { id },
    data: { nameMappings: { push: normalized } },
  });
}
