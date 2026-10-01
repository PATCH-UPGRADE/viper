import "server-only";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "@/trpc/init";
import {
  createImportInputSchema,
  createImportOutputSchema,
  failuresCsvOutputSchema,
  failuresInputSchema,
  failuresOutputSchema,
  importStatusSchema,
  type LinkedAsset,
  MAX_REQUEST_BYTES,
  previewInputSchema,
  previewOutputSchema,
  type RowOutcome,
  stageRowsInputSchema,
  startImportInputSchema,
} from "../contract";
import { findInFileConflicts } from "../import/conflicts";
import { loadMatchContext } from "../import/context";
import { type MatchContext, planMatches } from "../import/plan";

function assertWithinRequestLimit(input: unknown): void {
  const requestSize = JSON.stringify(input).length;
  if (requestSize > MAX_REQUEST_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This request is ${requestSize} bytes; the limit is ${MAX_REQUEST_BYTES}`,
    });
  }
}

function linkedAssetsFor(
  outcomes: RowOutcome[],
  context: MatchContext,
): LinkedAsset[] {
  const linkedAssetIds = new Set<string>();
  for (const outcome of outcomes) {
    if (outcome.kind === "link") linkedAssetIds.add(outcome.assetId);
  }
  const linkedAssets: LinkedAsset[] = [];
  for (const assetId of linkedAssetIds) {
    const asset = context.assets.get(assetId);
    if (!asset) continue;
    linkedAssets.push({
      id: asset.id,
      label: asset.label,
      serialNumber: asset.serialNumber,
      platforms: asset.platforms,
    });
  }
  return linkedAssets;
}

export const importProcedures = {
  preview: protectedProcedure
    .input(previewInputSchema)
    .output(previewOutputSchema)
    .mutation(async ({ input }) => {
      assertWithinRequestLimit(input);
      const inFileConflicts = findInFileConflicts(input.rows);
      const context = await loadMatchContext(input.rows);
      const outcomes = planMatches(input.rows, context, inFileConflicts);
      return { outcomes, linkedAssets: linkedAssetsFor(outcomes, context) };
    }),

  createImport: protectedProcedure
    .input(createImportInputSchema)
    .output(createImportOutputSchema)
    .mutation(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  stageRows: protectedProcedure
    .input(stageRowsInputSchema)
    .output(z.object({ stagedChunks: z.number().int() }))
    .mutation(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  startImport: protectedProcedure
    .input(startImportInputSchema)
    .output(importStatusSchema)
    .mutation(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  status: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .output(importStatusSchema)
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  failures: protectedProcedure
    .input(failuresInputSchema)
    .output(failuresOutputSchema)
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  failuresCsv: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .output(failuresCsvOutputSchema)
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),
} satisfies TRPCRouterRecord;
