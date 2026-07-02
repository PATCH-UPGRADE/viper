// Match extracted items from notification to VIPER db items (e.g, DeviceGroup)

import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { ExtractedAsset, ExtractedDeviceGroup, ExtractedRemediation, ExtractedVulnerability, ExtractResult } from "./extract";
import { normalizeName } from "@/lib/router-utils"
import { PrimitiveAtom } from "jotai";

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
};

export type RemediationCandidate = {
  id: string;
  linkedCveId: string | null;
  description: string | null;
};

export type AssetCandidate = {
  id: string;
  ip: string | null;
  hostname: string | null;
};

export type Candidates = {
  // Parallel to ExtractResult: one candidate list per extracted entity, in order.
  deviceGroups: Array<{
    extracted: ExtractedDeviceGroup;
    matches: DeviceGroupMatchingCandidate[];
  }>;
  vulnerabilities: Array<{
    extracted: ExtractedVulnerability;
    matches: VulnerabilitiyCandidate[]
  }>;
  remediations: Array<{
    extracted: ExtractedRemediation;
    matches: RemediationCandidate[]
  }>,
  assets: Array<{
    extracted: ExtractedAsset;
    matches: AssetCandidate[]
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

  const matched = new Map<string, DeviceGroupMatchingCandidate>();

  // find the owned DeviceGrop with the identifier first, then surface the DeviceGroupMatching
  // sharing its identy as match
  const identifierWhere: Prisma.DeviceGroupWhereInput[] = [];
  if(extracted.cpe) {
    identifierWhere.push({ cpe: { has: extracted.cpe }});
  }
  if(extracted.udi) {
    identifierWhere.push({ udi: extracted.udi})
  }

  if(identifierWhere.length > 0){
    const deviceGroup = await prisma.deviceGroup.findFirst({
      where: { OR : identifierWhere },
      select : { vendorId: true, productId: true, versionId: true }
    });
    if(deviceGroup?.vendorId) {
      const matchingSelect = {
        id: true,
        vendor: { select : { canonicalDisplayName: true }},
        product: { select: { canonicalDisplayName: true }},
        version: { select: { canonicalDisplayName: true }},
        versionRange: true
      } as const;

      const identity = {
        vendorId: deviceGroup.vendorId,
        prodcutId: deviceGroup.productId,
        versionId: deviceGroup.versionId
      };

      const existingMatching = await prisma.deviceGroupMatching.findFirst({
        where: identity,
        select: matchingSelect
      });

      const matching = existingMatching ?? (await prisma.deviceGroupMatching.create({
        data: identity,
        select: matchingSelect
      }));

      matched.set(matching.id, {
        id: matching.id,
        manufacturer: matching.vendor?.canonicalDisplayName ?? null,
        modelName: matching.product?.canonicalDisplayName ?? null,
        version: matching.version?.canonicalDisplayName ?? null,
        versionRange: matching.versionRange
      })
    }
  }

  const terms = [
    extracted.manufacturer,
    extracted.modelName,
  ].filter((t): t is string => !!t && t.trim().length > 0);

  if (terms.length === 0) return [];

  const or: Prisma.DeviceGroupMatchingWhereInput[] = [];
  // TODO: consider something like a fuzzy search?
  // or an embedding. For example, if the identified manufacturer is Draeger Inc, and the db manufactuerer is "Draeger", this contains fails
  for (const term of terms) {
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


  for(const row of rows) {
    matched.set(row.id, {
      id: row.id,
      manufacturer: row.vendor?.canonicalDisplayName ?? null,
      modelName: row.product?.canonicalDisplayName ?? null,
      version: row.version?.canonicalDisplayName ?? null,
      versionRange: row.versionRange
    });
  }
  return [...matched.values()]
}

async function searchVulnerability(extracted: ExtractedVulnerability): Promise<VulnerabilitiyCandidate[]> {
  const or: Prisma.VulnerabilityWhereInput[] = [];
  if(extracted.cveId) {
    or.push({ cveId: { contains: extracted.cveId, mode: "insensitive"}})
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

async function searchRemediation(extracted: ExtractedRemediation): Promise<RemediationCandidate[]> {
  const or: Prisma.RemediationWhereInput[] = [];
  if(extracted.linkedCveId) {
    or.push({ vulnerability: { cveId: { contains: extracted.linkedCveId, mode: "insensitive"}}});
  }
  if(extracted.description) {
    const insensitive = {contains : extracted.description, mode: "insensitive" as const};
    or.push({ description: insensitive }, { narrative: insensitive});
  }
  if( or.length === 0) return [];
  const rows = await prisma.remediation.findMany({
    where: { OR: or },
    select: {
      id: true,
      description: true,
      vulnerability: { select: {cveId: true }},
      deviceGroupMatchings: {
        select: {
          vendor: { select : { canonicalDisplayName: true}},
          product: { select : { canonicalDisplayName: true}}
        },
        take: 1
      },
    },
    take: TOP_K
  });

  return rows.map((row) => ({
    id: row.id,
    linkedCveId: row.vulnerability?.cveId ?? null,
    description: row.description ?? null,
  }))
}

async function searchAsset(extracted: ExtractedAsset): Promise<AssetCandidate[]> {
  const or: Prisma.AssetWhereInput[] = [];
  if(extracted.ip) {
    or.push({ip: {contains: extracted.ip}})
  }
  if(extracted.hostname) {
    or.push({ hostname: { contains: extracted.hostname, mode: "insensitive"}})
  }
  if(or.length === 0) return [];

  const rows = await prisma.asset.findMany({
    where: { OR: or },
    select: {
      id: true,
      ip: true,
      hostname: true,
      deviceGroup: {
        select: {
          vendor: { select : {canonicalDisplayName: true}},
          product: { select : {canonicalDisplayName:true}}
        }
      }
    },
    take: TOP_K
  });

  return rows.map((row) => ({
    id: row.id,
    ip: row.ip ?? null,
    hostname: row.hostname ?? null
  }));
}

export async function searchCandidates(
  extracted: ExtractResult,
): Promise<Candidates> {
  const [deviceGroups, vulnerabilities, remediations, assets] = await Promise.all(
    [
      Promise.all(extracted.deviceGroups.map(async (dg) => ({
        extracted: dg,
        matches: await searchDeviceGroupMatching(dg),
      }))),
      Promise.all(extracted.vulnerabilities.map(async (v) => ({
        extracted: v,
        matches: await searchVulnerability(v)
      }))),
      Promise.all(extracted.remediations.map(async (r)=> ({
        extracted: r,
        matches: await searchRemediation(r)
      }))),
      Promise.all(extracted.assets.map(async (a) => ({
        extracted: a,
        matches: await searchAsset(a)
      })))
    ]
  );

  return { deviceGroups, vulnerabilities, remediations, assets };
}
