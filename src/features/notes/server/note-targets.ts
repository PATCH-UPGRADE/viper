import "server-only";
import type { ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import {
  canonicalNameWhere,
  nameOrClauses,
  normalizeName,
  resolveMatchingId,
} from "@/lib/router-utils";

export async function resolveNoteTargetLabel(
  targetModel: ScopeTargetModel,
  instanceId: string,
): Promise<string | null> {
  switch (targetModel) {
    case "ASSET": {
      const asset = await prisma.asset.findUnique({
        where: { id: instanceId },
        select: { hostname: true, ip: true },
      });
      return asset ? (asset.hostname ?? asset.ip) : null;
    }
    case "VULNERABILITY": {
      const vuln = await prisma.vulnerability.findUnique({
        where: { id: instanceId },
        select: { cveId: true },
      });
      return vuln ? (vuln.cveId ?? `Vulnerability ${instanceId}`) : null;
    }
    case "REMEDIATION": {
      const remediation = await prisma.remediation.findUnique({
        where: { id: instanceId },
        select: { description: true },
      });
      if (!remediation) return null;
      const firstSentence = remediation.description?.trim().split("\n")[0];
      return firstSentence ? firstSentence : `Remediation ${instanceId}`;
    }
    case "DEVICE_GROUP_MATCHING": {
      const matching = await prisma.deviceGroupMatching.findUnique({
        where: { id: instanceId },
        select: {
          versionRange: true,
          manufacturer: { select: { canonicalDisplayName: true } },
          product: { select: { canonicalDisplayName: true } },
          version: { select: { canonicalDisplayName: true } },
        },
      });
      return matching ? deviceGroupMatchingLabel(matching) : null;
    }
  }
}

export type DeviceGroupMatchingIdentity = {
  manufacturerName: string;
  productName?: string | null;
  version?: string | null;
  versionRange?: string | null;
};

export type DeviceGroupMatchingLookup =
  | { found: true; id: string }
  | {
      found: false;
      unknownName: "manufacturer" | "product" | null;
      relatedMatchings: DeviceGroupMatchingIdentity[];
    };

const RELATED_LIMIT = 10;

async function firstUnknownName(
  manfacturerName: string,
  productName: string | null,
): Promise<"manufacturer" | "product" | null> {
  const manfacturer = await prisma.manufacturer.findFirst({
    where: canonicalNameWhere(manfacturerName),
    select: { id: true },
  });
  if (!manfacturer) return "manufacturer";
  if (!productName) return null;
  const product = await prisma.product.findFirst({
    where: canonicalNameWhere(productName),
    select: { id: true },
  });
  return product ? null : "product";
}

export async function findDeviceGroupMatching(
  identity: DeviceGroupMatchingIdentity,
  opts: { create: boolean },
): Promise<DeviceGroupMatchingLookup> {
  const productName = identity.productName || null;
  const version = identity.version || null;
  const versionRange = identity.versionRange || null;

  const existing = await prisma.deviceGroupMatching.findFirst({
    where: {
      manufacturer: canonicalNameWhere(identity.manufacturerName),
      ...(productName
        ? { product: canonicalNameWhere(productName) }
        : { productId: null }),
      ...(version
        ? { version: { canonicalName: normalizeName(version) } }
        : { versionId: null }),
      versionRange,
    },
    select: { id: true },
  });
  if (existing) return { found: true, id: existing.id };
  const unknownName = await firstUnknownName(
    identity.manufacturerName,
    productName,
  );

  if (opts.create && !unknownName) {
    const id = await resolveMatchingId({
      manufacturer: identity.manufacturerName,
      product: productName,
      version,
      versionRange,
      hasCpe: false,
    });
    return { found: true, id };
  }

  const related = await prisma.deviceGroupMatching.findMany({
    where: {
      OR: [
        { manufacturer: { OR: nameOrClauses(identity.manufacturerName) } },
        ...(productName
          ? [{ product: { OR: nameOrClauses(productName) } }]
          : []),
      ],
    },
    select: {
      versionRange: true,
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
      version: { select: { canonicalDisplayName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: RELATED_LIMIT,
  });

  return {
    found: false,
    unknownName,
    relatedMatchings: related.map((m) => ({
      manufacturerName: m.manufacturer.canonicalDisplayName,
      productName: m.product?.canonicalDisplayName ?? null,
      version: m.version?.canonicalDisplayName ?? null,
      versionRange: m.versionRange,
    })),
  };
}
