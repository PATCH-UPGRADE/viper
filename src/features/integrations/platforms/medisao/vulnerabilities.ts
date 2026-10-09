import "server-only";
import {
  CVE_PATTERN,
  normalizeIdentifier as normalizeVulnerabilityIdentifier,
} from "@/features/vulnerabilities/server/identity";
import prisma from "@/lib/db";
import { isUniqueViolation } from "@/lib/router-utils";

/** Trimmed, and a CVE upper-cased, so one identifier has one spelling. */
export const normalizeIdentifier = (name: string): string => {
  const trimmed = name.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed.toUpperCase() : trimmed;
};

interface ResolveOrMintInput {
  /** Identifiers exactly as MedISAO sent them: CVE, GHSA, or vendor ids. */
  names: string[];
  integrationId: string;
  /** The integration's shadow user, recorded as the creator of a minted row. */
  integrationUserId: string;
  /** The channel's matching. Every row minted here is attached to it. */
  deviceGroupMatchingId: string;
  /** Where MedISAO named the identifier, written into a non-CVE stub. */
  context: string;
}

interface ResolveOrMintResult {
  /** Normalized identifier → Vulnerability id, for every name given. */
  ids: Map<string, string>;
  created: number;
}

// TODO: VW-540 resolve and mint through VulnerabilityIdentifier + VulnerabilityRecord
// (VENDOR_ADVISORY) instead of ExternalVulnerabilityMapping and cveId. Until then a second
// integration minting the same non-CVE name hits the identifier's unique key and throws.
/**
 * Resolve every identifier to a Vulnerability, and mint the ones Viper does not
 * hold.
 *
 * A non-CVE identifier has no `cveId` to find it by, so every minted row carries
 * an `ExternalVulnerabilityMapping` keyed on the identifier. That mapping is
 * also the lock: two runs that mint the same identifier at once collide on its
 * unique key, and the loser reads the winner's row.
 *
 * A row this integration minted is attached to every channel that names it,
 * not only the first. A row another source holds is linked but left alone,
 * because its matchings belong to that source.
 *
 * Each write runs outside any transaction. `vulnerabilityExtension` opens the
 * baseline Issues through the outer client, which cannot see the matching
 * link of a row that an open transaction holds.
 */
export async function resolveOrMintVulnerabilities({
  names,
  integrationId,
  integrationUserId,
  deviceGroupMatchingId,
  context,
}: ResolveOrMintInput): Promise<ResolveOrMintResult> {
  const wanted = [...new Set(names.map(normalizeIdentifier))].filter(Boolean);
  const ids = new Map<string, string>();
  if (wanted.length === 0) return { ids, created: 0 };

  const adopt = async (name: string, row: MintedRow) => {
    if (!row.onMatching) await attach(row.id, deviceGroupMatchingId);
    ids.set(name, row.id);
  };

  const [minted, held] = await Promise.all([
    findMinted(integrationId, wanted, deviceGroupMatchingId),
    prisma.vulnerability.findMany({
      where: { cveId: { in: wanted } },
      select: { id: true, cveId: true },
    }),
  ]);
  // Minted first: the `cveId` lookup also finds a CVE minted here, and would
  // treat it as another source's row.
  for (const [name, row] of minted) await adopt(name, row);
  for (const row of held) {
    if (row.cveId && !ids.has(row.cveId)) ids.set(row.cveId, row.id);
  }

  let created = 0;
  for (const name of wanted.filter((name) => !ids.has(name))) {
    const isCve = CVE_PATTERN.test(name);
    const identifier = normalizeVulnerabilityIdentifier(name);
    if (!identifier) continue; // unreachable: blank names are filtered above
    try {
      const row = await prisma.vulnerability.create({
        data: {
          displayId: identifier.displayValue,
          identifiers: { create: identifier },
          cveId: isCve ? name : null,
          description: isCve ? null : `${name}. ${context}`,
          sarif: {},
          userId: integrationUserId,
          deviceGroupMatchings: { connect: [{ id: deviceGroupMatchingId }] },
          externalMappings: { create: { integrationId, externalId: name } },
        },
        select: { id: true },
      });
      ids.set(name, row.id);
      created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = (
        await findMinted(integrationId, [name], deviceGroupMatchingId)
      ).get(name);
      if (!raced) throw error;
      await adopt(name, raced);
    }
  }

  return { ids, created };
}

interface MintedRow {
  id: string;
  onMatching: boolean;
}

async function findMinted(
  integrationId: string,
  names: string[],
  deviceGroupMatchingId: string,
): Promise<Map<string, MintedRow>> {
  if (names.length === 0) return new Map();
  const rows = await prisma.externalVulnerabilityMapping.findMany({
    where: { integrationId, externalId: { in: names } },
    select: {
      externalId: true,
      item: {
        select: {
          id: true,
          deviceGroupMatchings: {
            where: { id: deviceGroupMatchingId },
            select: { id: true },
          },
        },
      },
    },
  });
  return new Map(
    rows.map((row) => [
      row.externalId,
      {
        id: row.item.id,
        onMatching: row.item.deviceGroupMatchings.length > 0,
      },
    ]),
  );
}

/**
 * `vulnerabilityExtension` opens Issues on create only, so a matching added
 * later needs its baseline Issue opened here.
 */
async function attach(vulnerabilityId: string, deviceGroupMatchingId: string) {
  await prisma.vulnerability.update({
    where: { id: vulnerabilityId },
    data: {
      deviceGroupMatchings: { connect: [{ id: deviceGroupMatchingId }] },
    },
  });
  await prisma.issue.createMany({
    data: [{ vulnerabilityId, deviceGroupMatchingId }],
    skipDuplicates: true,
  });
}
