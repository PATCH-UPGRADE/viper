// Match extracted items from notification to VIPER db items (e.g, DeviceGroup)

import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { ExtractedDeviceGroup, ExtractedVulnerability, ExtractResult } from "./extract";
import { normalizeName } from "@/lib/router-utils"

const TOP_K = 5;

export type DeviceGroupMatchingCandidate = {
  id: string;
  manufacturer: string | null;
  modelName: string | null;
  version: string | null;
  versionRange: string | null;
};

export type VulnerabilitiyCandidate = {
  id: string;
  cveId: string | null;
  description: string | null
}

export type Candidates = {
  // Parallel to ExtractResult: one candidate list per extracted entity, in order.
  deviceGroups: Array<{
    extracted: ExtractedDeviceGroup;
    matches: DeviceGroupMatchingCandidate[];
  }>;
  vulnerabilities: Array<{
    extracted: ExtractedVulnerability;
    matches: VulnerabilitiyCandidate[]
  }>
};

const nameOrClauses = (term: string) => [
  { canonicalName: { contains: term, mode: "insensitive" as const }},
  { canonicalDisplayName: { contains: term, mode: "insensitive" as const }},
  { nameMappings: { has: normalizeName(term) }}
];

const vendorNameOr = (term: string):Prisma.VendorWhereInput[] => nameOrClauses(term);
const productNameOr = (term: string):Prisma.ProductWhereInput[] => nameOrClauses(term)

// Returns top-K candidates per extracted entity.
async function searchDeviceGroupMatching(
  extracted: ExtractedDeviceGroup,
): Promise<DeviceGroupMatchingCandidate[]> {
  const terms = [
    extracted.manufacturer,
    extracted.modelName,
  ].filter((t): t is string => !!t && t.trim().length > 0);

  if (terms.length === 0) return [];

  const or: Prisma.DeviceGroupMatchingWhereInput[] = [];
  // TODO: consider something like a fuzzy search?
  // or an embedding. For example, if the identified manufacturer is Draeger Inc, and the db manufactuerer is "Draeger", this contains fails
  for (const term of terms) {
    const insensitive = { contains: term, mode: "insensitive" as const };
    // Identity now lives in canonical Vendor/Product rows and the cpe[] array.
    // cpe is a String[], which supports exact-element `has` (not substring).
    or.push(
      { vendor: { OR: vendorNameOr(term) } },
      { product: { OR: productNameOr(term) } },
    );
  }

  const rows = await prisma.deviceGroupMatching.findMany({
    where: { OR: or },
    select: {
      id: true,
      vendor: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
      version: { select: { canonicalDisplayName: true } },
      versionRange: true
    },
    take: TOP_K,
  });

  return rows.map((row) => ({
    id: row.id,
    manufacturer: row.vendor?.canonicalDisplayName ?? null,
    modelName: row.product?.canonicalDisplayName ?? null,
    version: row.version?.canonicalDisplayName ?? null,
    versionRange: row.versionRange
  }));
}

async function searchVulnerability(extracted: ExtractedVulnerability): Promise<VulnerabilitiyCandidate[]> {
  const or: Prisma.VulnerabilityWhereInput[] = [];
  if(extracted.cveId) {
    or.push({ cveId: { contains: extracted.cveId, mode: "insensitive"}})
  }
  if(extracted.manufacturer) {
    or.push({
      deviceGroupMatchings: {
        some: {vendor: { OR: vendorNameOr(extracted.manufacturer)}}
      }
    })
  }
  if(extracted.modelName) {
    or.push({
      deviceGroupMatchings: {
        some: { product: { OR: productNameOr(extracted.modelName)}}
      }
    })
  }
  if(or.length === 0) return [];

  const rows = await prisma.vulnerability.findMany({
    where: { OR: or },
    select: { id: true, cveId: true, description: true },
    take: TOP_K
  });

  return rows.map((row) => ({
    id: row.id,
    cveId: row.cveId ?? null,
    description: row.description ?? null
  }));
}

export async function searchCandidates(
  extracted: ExtractResult,
): Promise<Candidates> {
  const [deviceGroups, vulnerabilities] = await Promise.all(
    [
      Promise.all(extracted.deviceGroups.map(async (dg) => ({
        extracted: dg,
        matches: await searchDeviceGroupMatching(dg),
      }))),
      Promise.all(extracted.vulnerabilities.map(async (v)=> ({
        extracted: v,
        matches: await searchVulnerability(v)
      })))
    ]
  );

  return { deviceGroups, vulnerabilities };
}
