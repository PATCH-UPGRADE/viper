import "server-only";
import type { TRPCRouterRecord } from "@trpc/server";
import { normalizeName } from "@/lib/router-utils";
import { protectedProcedure } from "@/trpc/init";
import { suggestColumnMapping } from "../agent/map-columns";
import { suggestStatusValues } from "../agent/map-values";
import { suggestNameMatches } from "../agent/match-names";
import type { NameCandidate } from "../agent/match-names/context";
import type { NameSuggestion } from "../agent/match-names/schema";
import {
  type MatchNamesInput,
  type MatchNamesOutput,
  matchNamesInputSchema,
  matchNamesOutputSchema,
  type NameMatch,
  type SuggestMappingOutput,
  searchNamesInputSchema,
  searchNamesOutputSchema,
  suggestMappingInputSchema,
  suggestMappingOutputSchema,
} from "../contract";
import {
  type ExistingName,
  findExistingManufacturers,
  findExistingProducts,
  listManufacturerCandidates,
  listProductCandidates,
  searchNames,
} from "../import/names";

type ProductNameMatch = MatchNamesOutput["products"][number];
type FileProduct = MatchNamesInput["products"][number];

const distinct = (values: string[]): string[] => [...new Set(values)];

function toNameMatch(
  name: string,
  existing: ExistingName | undefined,
  suggestion: NameSuggestion | undefined,
  candidateById: Map<string, NameCandidate>,
): NameMatch {
  if (existing) {
    return {
      name,
      status: "exact",
      match: existing.ref,
      confidence: null,
      matchedByAlias: existing.matchedByAlias,
    };
  }
  const suggestedCandidate = suggestion
    ? candidateById.get(suggestion.id)
    : undefined;
  if (suggestion && suggestedCandidate) {
    return {
      name,
      status: "suggested",
      match: {
        id: suggestedCandidate.id,
        displayName: suggestedCandidate.displayName,
      },
      confidence: suggestion.confidence,
      matchedByAlias: false,
    };
  }
  return {
    name,
    status: "new",
    match: null,
    confidence: null,
    matchedByAlias: false,
  };
}

async function matchManufacturers(names: string[]): Promise<NameMatch[]> {
  const existingByName = await findExistingManufacturers(names);
  const namesWithoutExactMatch = distinct(
    names.filter((name) => !existingByName.has(normalizeName(name))),
  );
  const candidates =
    namesWithoutExactMatch.length > 0 ? await listManufacturerCandidates() : [];
  const suggestionByName = await suggestNameMatches({
    kind: "manufacturer",
    names: namesWithoutExactMatch,
    candidates,
  });
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );

  return names.map((name) =>
    toNameMatch(
      name,
      existingByName.get(normalizeName(name)),
      suggestionByName.get(name),
      candidateById,
    ),
  );
}

async function matchProducts(
  fileProducts: FileProduct[],
  manufacturerMatches: NameMatch[],
): Promise<ProductNameMatch[]> {
  const existingByName = await findExistingProducts(
    fileProducts.map((fileProduct) => fileProduct.product),
  );
  const viperManufacturerIdByFileName = new Map(
    manufacturerMatches.flatMap((manufacturerMatch) =>
      manufacturerMatch.match
        ? [[normalizeName(manufacturerMatch.name), manufacturerMatch.match.id]]
        : [],
    ),
  );
  const manufacturerIdOf = (fileProduct: FileProduct) =>
    viperManufacturerIdByFileName.get(normalizeName(fileProduct.manufacturer));

  const productNamesToAskByManufacturerId = new Map<string, string[]>();
  for (const fileProduct of fileProducts) {
    const manufacturerId = manufacturerIdOf(fileProduct);
    const hasExactMatch = existingByName.has(
      normalizeName(fileProduct.product),
    );
    if (!manufacturerId || hasExactMatch) continue;
    const productNames =
      productNamesToAskByManufacturerId.get(manufacturerId) ?? [];
    productNamesToAskByManufacturerId.set(
      manufacturerId,
      distinct([...productNames, fileProduct.product]),
    );
  }

  const candidates = await listProductCandidates([
    ...productNamesToAskByManufacturerId.keys(),
  ]);
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const suggestionsByManufacturerId = new Map(
    await Promise.all(
      [...productNamesToAskByManufacturerId].map(
        async ([manufacturerId, productNames]) => {
          const suggestions = await suggestNameMatches({
            kind: "product",
            names: productNames,
            candidates: candidates.filter((candidate) =>
              candidate.manufacturerIds.includes(manufacturerId),
            ),
          });
          return [manufacturerId, suggestions] as const;
        },
      ),
    ),
  );

  return fileProducts.map((fileProduct) => {
    const manufacturerId = manufacturerIdOf(fileProduct);
    const suggestion = manufacturerId
      ? suggestionsByManufacturerId
          .get(manufacturerId)
          ?.get(fileProduct.product)
      : undefined;
    const productMatch = toNameMatch(
      fileProduct.product,
      existingByName.get(normalizeName(fileProduct.product)),
      suggestion,
      candidateById,
    );
    return { ...productMatch, manufacturer: fileProduct.manufacturer };
  });
}

async function statusValuesOrNone(
  statusHeader: string,
  statusColumnValues: string[],
): Promise<SuggestMappingOutput["statusValues"]> {
  try {
    return await suggestStatusValues(statusHeader, statusColumnValues);
  } catch (error) {
    console.error("Failed to suggest CSV status values:", error);
    return [];
  }
}

export const mappingProcedures = {
  suggestMapping: protectedProcedure
    .input(suggestMappingInputSchema)
    .output(suggestMappingOutputSchema)
    .mutation(async ({ input }) => {
      const fields = await suggestColumnMapping(
        input.headers,
        input.sampleRows,
      );
      const statusHeader = fields.status?.header;
      if (!statusHeader) return { fields, statusValues: [] };

      const statusColumnValues = input.distinctValues[statusHeader] ?? [];
      const statusValues = await statusValuesOrNone(
        statusHeader,
        statusColumnValues,
      );
      return { fields, statusValues };
    }),

  matchNames: protectedProcedure
    .input(matchNamesInputSchema)
    .output(matchNamesOutputSchema)
    .mutation(async ({ input }) => {
      const manufacturers = await matchManufacturers(input.manufacturers);
      const products = await matchProducts(input.products, manufacturers);
      return { manufacturers, products };
    }),

  searchNames: protectedProcedure
    .input(searchNamesInputSchema)
    .output(searchNamesOutputSchema)
    .query(({ input }) =>
      searchNames(input.kind, input.query, input.manufacturerId),
    ),
} satisfies TRPCRouterRecord;
