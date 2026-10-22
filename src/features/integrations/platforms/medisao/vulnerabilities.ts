import "server-only";
import {
  CVE_PATTERN,
  isGlobalVulnerabilityIdentifier,
  normalizeIdentifier as normalizeVulnerabilityIdentifier,
} from "@/features/vulnerabilities/server/identity";
import {
  createVulnerabilityRecord,
  updateVulnerabilityRecord,
} from "@/features/vulnerabilities/server/records";
import { VulnerabilitySource } from "@/generated/prisma";
import prisma from "@/lib/db";
import { isUniqueViolation } from "@/lib/router-utils";

/** Trimmed, and a CVE upper-cased, so one identifier has one spelling. */
export const normalizeIdentifier = (name: string): string => {
  const trimmed = name.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed.toUpperCase() : trimmed;
};

interface ResolveOrMintInput {
  /** Identifiers exactly as MedISAO sent them. Only CVE and GHSA IDs are used. */
  names: string[];
  integrationId: string;
  /** The integration's shadow user. Only fills the legacy Vulnerability.userId column. */
  integrationUserId: string;
  /** The channel's matching. Every stub minted here is attached to it. */
  deviceGroupMatchingId: string;
}

interface ResolveOrMintResult {
  /** Normalized identifier → Vulnerability id, for every name that resolved. */
  ids: Map<string, string>;
  created: number;
}

/** A vulnerability found by one identifier. */
interface Held {
  vulnerabilityId: string;
  /** The OTHER record a MedISAO mint left for this identifier, when the row is a stub. */
  stubRecordId: string | null;
  onMatching: boolean;
}

/**
 * Resolve every identifier to a Vulnerability through VulnerabilityIdentifier, and mint a stub
 * for each one Viper does not hold yet, so the inbox agents know the vulnerability exists.
 *
 * Only globally unique IDs (CVE, GHSA) are resolved or minted; anything else is skipped with a
 * warning, since a vendor-local ID could name two different vulnerabilities. The name still
 * appears in the advisory or remediation text.
 *
 * A stub is an OTHER VulnerabilityRecord whose sourceId is the identifier itself. Creating it
 * creates the Vulnerability. Its unique key (source, sourceId, vulnerabilityId) is also the lock:
 * when two runs mint the same identifier at once, the loser's record collides, and it reads the
 * winner's row instead.
 * TODO: VW-583 fetch each stub's details from NVD or GHSA, and give it that source.
 *
 * A stub is attached to every channel that names it, not only the first. A vulnerability another
 * source holds is linked but left alone, because its devices belong to that source.
 */
export async function resolveOrMintVulnerabilities({
  names,
  integrationId,
  integrationUserId,
  deviceGroupMatchingId,
}: ResolveOrMintInput): Promise<ResolveOrMintResult> {
  const ids = new Map<string, string>();
  // Lookup value → every normalized name that spells it, e.g. two casings of one GHSA ID.
  const wanted = new Map<string, string[]>();
  for (const name of new Set(names.map(normalizeIdentifier))) {
    if (!name) continue;
    if (!isGlobalVulnerabilityIdentifier(name)) {
      console.warn(
        "MedISAO named a vulnerability without a CVE or GHSA ID; skipping it",
        { name, integrationId },
      );
      continue;
    }
    const value = normalizeVulnerabilityIdentifier(name)?.value;
    if (value) wanted.set(value, [...(wanted.get(value) ?? []), name]);
  }
  if (wanted.size === 0) return { ids, created: 0 };

  const adopt = async (value: string, held: Held) => {
    if (held.stubRecordId && !held.onMatching) {
      await updateVulnerabilityRecord(held.stubRecordId, {
        deviceGroupMatchingIds: [deviceGroupMatchingId],
      });
    }
    for (const name of wanted.get(value) ?? []) {
      ids.set(name, held.vulnerabilityId);
    }
  };

  const found = await findHeld([...wanted.keys()], deviceGroupMatchingId);
  for (const [value, held] of found) await adopt(value, held);

  let created = 0;
  for (const [value, [name]] of wanted) {
    if (found.has(value)) continue;
    try {
      const { vulnerabilityId, vulnerabilityCreated } =
        await createVulnerabilityRecord(
          {
            // TODO: VW-583 set the real source once the details are fetched
            source: VulnerabilitySource.OTHER,
            sourceId: value,
            identifiers: [name],
            deviceGroupMatchingIds: [deviceGroupMatchingId],
            userId: null,
          },
          { actingUserId: integrationUserId },
        );
      for (const spelling of wanted.get(value) ?? []) {
        ids.set(spelling, vulnerabilityId);
      }
      if (vulnerabilityCreated) created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = (await findHeld([value], deviceGroupMatchingId)).get(value);
      if (!raced) throw error;
      await adopt(value, raced);
    }
  }

  return { ids, created };
}

async function findHeld(
  values: string[],
  deviceGroupMatchingId: string,
): Promise<Map<string, Held>> {
  const rows = await prisma.vulnerabilityIdentifier.findMany({
    where: { value: { in: values } },
    select: {
      value: true,
      vulnerabilityId: true,
      vulnerability: {
        select: {
          records: {
            where: {
              source: VulnerabilitySource.OTHER,
              sourceId: { in: values },
            },
            select: { id: true, sourceId: true },
          },
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
      row.value,
      {
        vulnerabilityId: row.vulnerabilityId,
        stubRecordId:
          row.vulnerability.records.find(
            (record) => record.sourceId === row.value,
          )?.id ?? null,
        onMatching: row.vulnerability.deviceGroupMatchings.length > 0,
      },
    ]),
  );
}
