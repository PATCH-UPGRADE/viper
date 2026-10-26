import "server-only";
import {
  isGlobalVulnerabilityIdentifier,
  normalizeIdentifier as normalizeVulnerabilityIdentifier,
} from "@/features/vulnerabilities/server/identity";
import { createVulnerabilityRecord } from "@/features/vulnerabilities/server/records";
import { CVE_PATTERN } from "@/features/vulnerabilities/utils";
import { VulnerabilitySource } from "@/generated/prisma";
import prisma from "@/lib/db";
import { isUniqueViolation } from "@/lib/router-utils";

/** Trimmed, and a CVE upper-cased, so one identifier has one spelling. */
export const normalizeIdentifier = (name: string): string => {
  const trimmed = name.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed.toUpperCase() : trimmed;
};

interface ResolveOrMintInput {
  /** Identifiers exactly as MedISAO sent them */
  names: string[];
  /** The channel's matching. A stub minted here is attached to it; a held vulnerability is not. */
  deviceGroupMatchingId: string;
}

interface ResolveOrMintResult {
  /** Normalized identifier → Vulnerability id, for every name that resolved. */
  ids: Map<string, string>;
  created: number;
}

/**
 * Resolve every identifier to a Vulnerability through VulnerabilityIdentifier, and mint a stub
 * for each one Viper does not hold yet.
 *
 * TODO: VW-583 is to populate the fields of this stub by searching NVD/GHSA API's
 *
 * (Possible TODO for VW-583, depending on MedISAO behavior) A vulnerability Viper already
 * holds is only linked, never given this channel's devices, even when it is a stub
 * another channel minted.
 *
 * first: populate `wanted`, a list of normalized vulnerability identifiers based on `names`
 * second: find all vulnerabilities with those identifiers
 * third: for vulnerabilities that we can't find, create new stub records
 *    the source is OTHER, and the vulnerability is attached to deviceGroupMatchingId
 * return all matched identifiers, and how many vulns were created
 *
 */
export async function resolveOrMintVulnerabilities({
  names,
  deviceGroupMatchingId,
}: ResolveOrMintInput): Promise<ResolveOrMintResult> {
  const ids = new Map<string, string>();
  const wanted = new Map<string, string[]>();
  for (const name of new Set(names.map(normalizeIdentifier))) {
    if (!name) continue;
    if (!isGlobalVulnerabilityIdentifier(name)) {
      // TODO: does MedISAO give us vendor ID's for vulnerabilities? If so, that may be more work for us
      // since those vendor ID's could potentially collide with each other if they don't have unique
      // prefixes (i.e, Baxter vulnerability #27 might collid with Meditech vulnerability #27)
      // As MedISAO today is not a real service used in the world today, I would like to avoid doing
      // this extra work of constructing unique vendor prefixes until we learn it's necessary.
      // They might just give us only CVE/GHSA, in which case it'd be unnecessary.
      console.warn(
        "MedISAO named a vulnerability without a CVE or GHSA ID; skipping it",
        { name },
      );
      continue;
    }
    const value = normalizeVulnerabilityIdentifier(name)?.value;
    if (value) wanted.set(value, [...(wanted.get(value) ?? []), name]);
  }
  if (wanted.size === 0) return { ids, created: 0 };

  const link = (value: string, vulnerabilityId: string) => {
    for (const name of wanted.get(value) ?? []) ids.set(name, vulnerabilityId);
  };

  const found = await findHeld([...wanted.keys()]);
  for (const [value, vulnerabilityId] of found) link(value, vulnerabilityId);

  let created = 0;
  for (const [value, [name]] of wanted) {
    if (found.has(value)) continue;
    try {
      const { vulnerabilityId, vulnerabilityCreated } =
        await createVulnerabilityRecord({
          source: VulnerabilitySource.OTHER,
          sourceId: value,
          identifiers: [name],
          deviceGroupMatchingIds: [deviceGroupMatchingId],
          userId: null,
        });
      link(value, vulnerabilityId);
      if (vulnerabilityCreated) created += 1;
    } catch (error) {
      // Another run minted this identifier first, and its stub record holds the unique key.
      if (!isUniqueViolation(error)) throw error;
      const raced = (await findHeld([value])).get(value);
      if (!raced) throw error;
      link(value, raced);
    }
  }

  return { ids, created };
}

/** Lookup value → the id of the Vulnerability that holds it, for every value Viper knows. */
async function findHeld(values: string[]): Promise<Map<string, string>> {
  const rows = await prisma.vulnerabilityIdentifier.findMany({
    where: { value: { in: values } },
    select: { value: true, vulnerabilityId: true },
  });
  return new Map(rows.map((row) => [row.value, row.vulnerabilityId]));
}
