import "server-only";
import prisma from "@/lib/db";
import {
  canonicalNameWhere,
  nameOrClauses,
  normalizeName,
} from "@/lib/router-utils";
import type { NameCandidate, NameKind } from "../agent/match-names/context";
import { MAX_NAME_SEARCH_RESULTS, type NameRef } from "../contract";

export interface ExistingName {
  ref: NameRef;
  matchedByAlias: boolean;
}

export interface ProductCandidate extends NameCandidate {
  manufacturerIds: string[];
}

interface NamedRow {
  id: string;
  canonicalName: string;
  canonicalDisplayName: string;
  nameMappings: string[];
}

const MAX_MANUFACTURER_CANDIDATES = 1000;

const namedSelect = {
  id: true,
  canonicalName: true,
  canonicalDisplayName: true,
  nameMappings: true,
} as const;

const toNameRef = (row: NamedRow): NameRef => ({
  id: row.id,
  displayName: row.canonicalDisplayName,
});

const toCandidate = (row: NamedRow): NameCandidate => ({
  id: row.id,
  displayName: row.canonicalDisplayName,
  aliases: row.nameMappings,
});

const distinctNormalizedNames = (names: string[]): string[] => [
  ...new Set(names.map(normalizeName).filter((name) => name.length > 0)),
];

const canonicalNameOrAliasIn = (wanted: string[]) => ({
  OR: [
    { canonicalName: { in: wanted } },
    { nameMappings: { hasSome: wanted } },
  ],
});

function indexByWantedName(
  rows: NamedRow[],
  wanted: string[],
): Map<string, ExistingName> {
  const rowByCanonicalName = new Map(
    rows.map((row) => [row.canonicalName, row]),
  );
  const rowByAlias = new Map<string, NamedRow>();
  for (const row of rows) {
    for (const alias of row.nameMappings) {
      if (!rowByAlias.has(alias)) rowByAlias.set(alias, row);
    }
  }

  const existingByName = new Map<string, ExistingName>();
  for (const name of wanted) {
    const canonicalMatch = rowByCanonicalName.get(name);
    const aliasMatch = rowByAlias.get(name);
    const matchedRow = canonicalMatch ?? aliasMatch;
    if (!matchedRow) continue;
    existingByName.set(name, {
      ref: toNameRef(matchedRow),
      matchedByAlias: canonicalMatch === undefined,
    });
  }
  return existingByName;
}

export async function findExistingManufacturers(
  names: string[],
): Promise<Map<string, ExistingName>> {
  const wanted = distinctNormalizedNames(names);
  if (wanted.length === 0) return new Map();
  const rows = await prisma.manufacturer.findMany({
    where: canonicalNameOrAliasIn(wanted),
    select: namedSelect,
  });
  return indexByWantedName(rows, wanted);
}

export async function findExistingProducts(
  names: string[],
): Promise<Map<string, ExistingName>> {
  const wanted = distinctNormalizedNames(names);
  if (wanted.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: canonicalNameOrAliasIn(wanted),
    select: namedSelect,
  });
  return indexByWantedName(rows, wanted);
}

export async function listManufacturerCandidates(): Promise<NameCandidate[]> {
  const rows = await prisma.manufacturer.findMany({
    select: namedSelect,
    orderBy: { canonicalName: "asc" },
    take: MAX_MANUFACTURER_CANDIDATES,
  });
  return rows.map(toCandidate);
}

export async function listProductCandidates(
  manufacturerIds: string[],
): Promise<ProductCandidate[]> {
  if (manufacturerIds.length === 0) return [];
  const underTheseManufacturers = { manufacturerId: { in: manufacturerIds } };
  const rows = await prisma.product.findMany({
    where: { deviceGroups: { some: underTheseManufacturers } },
    select: {
      ...namedSelect,
      deviceGroups: {
        where: underTheseManufacturers,
        select: { manufacturerId: true },
      },
    },
    orderBy: { canonicalName: "asc" },
  });
  return rows.map((row) => {
    const madeBy = row.deviceGroups.flatMap((group) =>
      group.manufacturerId ? [group.manufacturerId] : [],
    );
    return { ...toCandidate(row), manufacturerIds: [...new Set(madeBy)] };
  });
}

export async function searchNames(
  kind: NameKind,
  query: string,
  manufacturerId?: string,
): Promise<NameRef[]> {
  const matchingTheQuery = query ? { OR: nameOrClauses(query) } : {};
  if (kind === "manufacturer") {
    const rows = await prisma.manufacturer.findMany({
      where: matchingTheQuery,
      select: namedSelect,
      orderBy: { canonicalDisplayName: "asc" },
      take: MAX_NAME_SEARCH_RESULTS,
    });
    return rows.map(toNameRef);
  }
  const madeByThatManufacturer = manufacturerId
    ? { deviceGroups: { some: { manufacturerId } } }
    : {};
  const rows = await prisma.product.findMany({
    where: { ...matchingTheQuery, ...madeByThatManufacturer },
    select: namedSelect,
    orderBy: { canonicalDisplayName: "asc" },
    take: MAX_NAME_SEARCH_RESULTS,
  });
  return rows.map(toNameRef);
}

export async function nameBelongsToAnother(
  kind: NameKind,
  name: string,
  id: string,
): Promise<boolean> {
  const sameNameElsewhere = { id: { not: id }, ...canonicalNameWhere(name) };
  const other =
    kind === "manufacturer"
      ? await prisma.manufacturer.findFirst({
          where: sameNameElsewhere,
          select: { id: true },
        })
      : await prisma.product.findFirst({
          where: sameNameElsewhere,
          select: { id: true },
        });
  return other !== null;
}
