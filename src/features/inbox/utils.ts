import "server-only";
import prisma from "@/lib/db";
import { normalizeName } from "@/lib/router-utils";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

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
      .filter(
        (a) =>
          (a.contentType?.startsWith("application/pdf") ||
            a.filename?.toLowerCase().endsWith(".pdf")) &&
          a.downloadUrl !== null,
      )
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

export function parseCvssScore(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 20
    ? parsed
    : undefined;
}
