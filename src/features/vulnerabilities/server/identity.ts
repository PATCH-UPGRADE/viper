// No "server-only": the dev seed imports this under plain tsx, where that package throws.
// Helper functions used to match vulnerabilities or display them based on their identifiers
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { TransactionClient } from "@/lib/db";

export const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;
const GHSA_PATTERN = /^GHSA(-[0-9a-z]{4}){3}$/i;
const VIPER_PREFIX = "VIPER-";

/** One identifier as it is stored: `value` for lookup, `displayValue` as published. */
export interface NormalizedIdentifier {
  /** Trimmed and upper-cased, so one identifier has one spelling: "GHSA-JFH8-C2JP-5V3Q". */
  value: string;
  /** Trimmed only: "GHSA-jfh8-c2jp-5v3q". A CVE is upper-cased here too. */
  displayValue: string;
}

type IdentifierReader = Pick<TransactionClient, "vulnerabilityIdentifier">;

export function normalizeIdentifier(raw: string): NormalizedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = trimmed.toUpperCase();
  return {
    value,
    displayValue: CVE_PATTERN.test(trimmed) ? value : trimmed,
  };
}

/** Normalize, drop blanks, and keep the first spelling of each value, in input order. */
export function normalizeIdentifiers(raws: string[]): NormalizedIdentifier[] {
  const byValue = new Map<string, NormalizedIdentifier>();
  for (const raw of raws) {
    const identifier = normalizeIdentifier(raw);
    if (identifier && !byValue.has(identifier.value)) {
      byValue.set(identifier.value, identifier);
    }
  }
  return [...byValue.values()];
}

/** Lower is better: CVE > GHSA > other public ID > VIPER. */
function rank(value: string): number {
  if (CVE_PATTERN.test(value)) return 0;
  if (GHSA_PATTERN.test(value)) return 1;
  if (value.startsWith(VIPER_PREFIX)) return 3;
  return 2;
}

/**
 * The best human-facing ID among a vulnerability's identifiers, or null when it has none.
 * Ties keep input order, so pass identifiers oldest first for a stable choice.
 */
export function computeDisplayId(
  identifiers: NormalizedIdentifier[],
): string | null {
  let best: NormalizedIdentifier | null = null;
  for (const identifier of identifiers) {
    if (!best || rank(identifier.value) < rank(best.value)) best = identifier;
  }
  return best?.displayValue ?? null;
}

/** An identifier for a vulnerability that has no public ID yet (e.g, a TA3 zero-day). */
export function mintViperIdentifier(): NormalizedIdentifier {
  const value = `${VIPER_PREFIX}${randomBytes(6).toString("hex").toUpperCase()}`;
  return { value, displayValue: value };
}

/**
 * The one vulnerability these identifiers resolve to, or null when none of them is known.
 * Throws CONFLICT when they resolve to more than one vulnerability.
 */
export async function findVulnerabilityByIdentifiers(
  client: IdentifierReader,
  values: string[],
): Promise<string | null> {
  if (values.length === 0) return null;
  const rows = await client.vulnerabilityIdentifier.findMany({
    where: { value: { in: values } },
    select: { value: true, vulnerabilityId: true },
  });
  const vulnerabilityIds = new Set(rows.map((row) => row.vulnerabilityId));
  if (vulnerabilityIds.size > 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Identifiers ${rows.map((row) => row.value).join(", ")} belong to different vulnerabilities`,
    });
  }
  return rows[0]?.vulnerabilityId ?? null;
}

/**
 * Attach identifiers to a vulnerability. Ones it already has are left alone; one that belongs
 * to another vulnerability throws CONFLICT. Does not recompute `displayId`.
 */
export async function upsertIdentifiers(
  client: IdentifierReader,
  vulnerabilityId: string,
  identifiers: NormalizedIdentifier[],
): Promise<void> {
  if (identifiers.length === 0) return;
  await client.vulnerabilityIdentifier.createMany({
    data: identifiers.map((identifier) => ({ ...identifier, vulnerabilityId })),
    skipDuplicates: true,
  });
  const taken = await client.vulnerabilityIdentifier.findMany({
    where: {
      value: { in: identifiers.map((identifier) => identifier.value) },
      vulnerabilityId: { not: vulnerabilityId },
    },
    select: { value: true },
  });
  if (taken.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Identifiers ${taken.map((row) => row.value).join(", ")} already belong to another vulnerability`,
    });
  }
}
