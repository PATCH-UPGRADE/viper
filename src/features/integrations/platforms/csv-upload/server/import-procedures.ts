import "server-only";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { createIntegration } from "@/features/integrations/server/create-integration";
import {
  CsvImportStatus,
  PlatformEnum,
  type Prisma,
  ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  CSV_IMPORT_EVENT,
  createImportInputSchema,
  createImportOutputSchema,
  failuresCsvOutputSchema,
  failuresInputSchema,
  failuresOutputSchema,
  type ImportFailure,
  type ImportStatus,
  importFailureSchema,
  importPlanSchema,
  importStatusSchema,
  type LinkedAsset,
  MAX_REQUEST_BYTES,
  previewInputSchema,
  previewOutputSchema,
  type RowOutcome,
  SEE_LIST_PAGE_SIZE,
  type StagedRow,
  stageRowsInputSchema,
  startImportInputSchema,
} from "../contract";
import { findInFileConflicts } from "../import/conflicts";
import { loadMatchContext } from "../import/context";
import { type MatchContext, matchRowsToDevices } from "../import/match-rows";
import { findStagedRows, putChunk } from "../import/staging";
import { toCsv } from "../import/to-csv";

const ownedImportSelect = {
  id: true,
  userId: true,
  integrationId: true,
  fileName: true,
  chunkCount: true,
  status: true,
  totalRows: true,
  addedCount: true,
  linkedCount: true,
  failedCount: true,
  finishedAt: true,
  integration: { select: { name: true } },
} as const satisfies Prisma.CsvImportSelect;

type OwnedImport = Prisma.CsvImportGetPayload<{
  select: typeof ownedImportSelect;
}>;

const sourceNameDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const defaultSourceName = (today: Date): string =>
  `CSV Assets Upload - ${sourceNameDate.format(today)}`;

function assertWithinRequestLimit(input: unknown): void {
  const requestSize = JSON.stringify(input).length;
  if (requestSize > MAX_REQUEST_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This request is ${requestSize} bytes; the limit is ${MAX_REQUEST_BYTES}`,
    });
  }
}

async function requireOwnImport(
  importId: string,
  userId: string,
): Promise<OwnedImport> {
  const csvImport = requireExistence(
    await prisma.csvImport.findUnique({
      where: { id: importId },
      select: ownedImportSelect,
    }),
    "CSV import",
  );
  if (csvImport.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the person who started this import can use it",
    });
  }
  return csvImport;
}

function toImportStatus(csvImport: OwnedImport): ImportStatus {
  return {
    importId: csvImport.id,
    integrationId: csvImport.integrationId,
    sourceName: csvImport.integration.name,
    fileName: csvImport.fileName,
    status: csvImport.status,
    totalRows: csvImport.totalRows,
    addedCount: csvImport.addedCount,
    linkedCount: csvImport.linkedCount,
    failedCount: csvImport.failedCount,
    finishedAt: csvImport.finishedAt,
  };
}

const recordedFailuresSchema = z.array(importFailureSchema);

async function readFailures(
  importId: string,
): Promise<{ failures: ImportFailure[]; headers: string[] }> {
  const csvImport = await prisma.csvImport.findUniqueOrThrow({
    where: { id: importId },
    select: { failures: true, headers: true },
  });
  const failures = recordedFailuresSchema.parse(csvImport.failures);
  const failuresInFileOrder = [...failures].sort(
    (first, second) => first.rowNumber - second.rowNumber,
  );
  return { failures: failuresInFileOrder, headers: csvImport.headers };
}

function failureLabel(
  stagedRow: StagedRow | undefined,
  rowNumber: number,
): string {
  const deviceName = [stagedRow?.manufacturer, stagedRow?.product]
    .filter(Boolean)
    .join(" ");
  const serial = stagedRow?.serialNumber;
  if (deviceName && serial) return `${deviceName} · ${serial}`;
  return deviceName || serial || `Row ${rowNumber}`;
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
      const outcomes = matchRowsToDevices(input.rows, context, inFileConflicts);
      return { outcomes, linkedAssets: linkedAssetsFor(outcomes, context) };
    }),

  createImport: protectedProcedure
    .input(createImportInputSchema)
    .output(createImportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      assertWithinRequestLimit(input);
      const sourceName = input.sourceName || defaultSourceName(new Date());
      const integration = await createIntegration(
        { name: sourceName, platform: PlatformEnum.CSV_UPLOAD, config: {} },
        ctx.auth.user.id,
      );
      const plan = importPlanSchema.parse(input);
      const csvImport = await prisma.csvImport.create({
        data: {
          integrationId: integration.id,
          userId: ctx.auth.user.id,
          fileName: input.fileName,
          headers: input.headers,
          plan,
          totalRows: input.rowCount,
        },
        select: { id: true },
      });
      return {
        importId: csvImport.id,
        integrationId: integration.id,
        sourceName: integration.name,
      };
    }),

  stageRows: protectedProcedure
    .input(stageRowsInputSchema)
    .output(z.object({ stagedChunks: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      assertWithinRequestLimit(input);
      const csvImport = await requireOwnImport(
        input.importId,
        ctx.auth.user.id,
      );
      if (csvImport.status !== CsvImportStatus.Staging) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This import has already started",
        });
      }
      if (input.chunkIndex > csvImport.chunkCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chunk ${input.chunkIndex} arrived before chunk ${csvImport.chunkCount}`,
        });
      }

      await putChunk(csvImport.id, input.chunkIndex, input.rows);

      const isNextChunk = input.chunkIndex === csvImport.chunkCount;
      if (isNextChunk) {
        await prisma.csvImport.update({
          where: { id: csvImport.id },
          data: { chunkCount: input.chunkIndex + 1 },
        });
      }
      return {
        stagedChunks: Math.max(csvImport.chunkCount, input.chunkIndex + 1),
      };
    }),

  startImport: protectedProcedure
    .input(startImportInputSchema)
    .output(importStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const csvImport = await requireOwnImport(
        input.importId,
        ctx.auth.user.id,
      );
      const notStartedYet =
        csvImport.status === CsvImportStatus.Staging ||
        csvImport.status === CsvImportStatus.Queued;
      if (!notStartedYet) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This import has already started",
        });
      }
      if (csvImport.chunkCount !== input.chunkCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Expected ${input.chunkCount} staged chunks but found ${csvImport.chunkCount}`,
        });
      }

      const queuedImport = await prisma.$transaction(async (tx) => {
        await tx.integrationResourceSync.update({
          where: {
            integrationId_resource: {
              integrationId: csvImport.integrationId,
              resource: ResourceType.Asset,
            },
          },
          data: {
            status: SyncStatusEnum.Pending,
            errorMessage: null,
            lastAttemptAt: new Date(),
          },
        });
        return tx.csvImport.update({
          where: { id: csvImport.id },
          data: { status: CsvImportStatus.Queued },
          select: ownedImportSelect,
        });
      });

      await inngest.send({
        name: CSV_IMPORT_EVENT,
        data: { importId: csvImport.id },
      });
      return toImportStatus(queuedImport);
    }),

  status: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .output(importStatusSchema)
    .query(async ({ ctx, input }) => {
      const csvImport = await requireOwnImport(
        input.importId,
        ctx.auth.user.id,
      );
      return toImportStatus(csvImport);
    }),

  failures: protectedProcedure
    .input(failuresInputSchema)
    .output(failuresOutputSchema)
    .query(async ({ ctx, input }) => {
      const csvImport = await requireOwnImport(
        input.importId,
        ctx.auth.user.id,
      );
      const { failures } = await readFailures(csvImport.id);
      const pageStart = (input.page - 1) * SEE_LIST_PAGE_SIZE;
      const failuresOnPage = failures.slice(
        pageStart,
        pageStart + SEE_LIST_PAGE_SIZE,
      );
      const stagedRows = await findStagedRows(
        csvImport.id,
        csvImport.chunkCount,
        new Set(failuresOnPage.map((failure) => failure.rowNumber)),
      );
      const items = failuresOnPage.map((failure) => ({
        ...failure,
        label: failureLabel(
          stagedRows.get(failure.rowNumber),
          failure.rowNumber,
        ),
      }));
      return { items, total: failures.length };
    }),

  failuresCsv: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .output(failuresCsvOutputSchema)
    .query(async ({ ctx, input }) => {
      const csvImport = await requireOwnImport(
        input.importId,
        ctx.auth.user.id,
      );
      const { failures, headers } = await readFailures(csvImport.id);
      const stagedRows = await findStagedRows(
        csvImport.id,
        csvImport.chunkCount,
        new Set(failures.map((failure) => failure.rowNumber)),
      );
      const failedRowLines = failures.map((failure) => {
        const originalCells = stagedRows.get(failure.rowNumber)?.raw ?? [];
        const cellsUnderEachHeader = headers.map(
          (_header, column) => originalCells[column] ?? "",
        );
        return [...cellsUnderEachHeader, failure.reason];
      });
      return {
        fileName: `${csvImport.integration.name}-failed-rows.csv`,
        csv: toCsv([[...headers, "Reason"], ...failedRowLines]),
      };
    }),
} satisfies TRPCRouterRecord;
