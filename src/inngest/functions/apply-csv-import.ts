import "server-only";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { addManufacturerAlias, addProductAlias } from "@/features/inbox/utils";
import { upsertResourceSync } from "@/features/integrations/core/sync/upsert";
import {
  CSV_IMPORT_EVENT,
  type ImportFailure,
  importFailureSchema,
  importPlanSchema,
  type NameDecision,
  normalizeNameKey,
  productKey,
  type StagedRow,
} from "@/features/integrations/platforms/csv-upload/contract";
import {
  type AppliedCounts,
  applyChunk,
} from "@/features/integrations/platforms/csv-upload/import/apply";
import { findInFileConflicts } from "@/features/integrations/platforms/csv-upload/import/conflicts";
import {
  loadCanonicalNames,
  loadMatchContext,
} from "@/features/integrations/platforms/csv-upload/import/context";
import {
  type MatchContext,
  matchRowsToDevices,
} from "@/features/integrations/platforms/csv-upload/import/match-rows";
import { nameBelongsToAnother } from "@/features/integrations/platforms/csv-upload/import/names";
import {
  deleteChunks,
  getChunk,
} from "@/features/integrations/platforms/csv-upload/import/staging";
import { CsvImportStatus, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest } from "../client";

interface ImportJob {
  importId: string;
  integrationId: string;
  userId: string;
  chunkCount: number;
}

interface ImportCounts {
  totalRows: number;
  addedCount: number;
  linkedCount: number;
  failedCount: number;
}

type StepOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; errorMessage: string };

const recordedFailuresSchema = z.array(importFailureSchema);

async function settle<T>(work: () => Promise<T>): Promise<StepOutcome<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    console.error("Failed to run a CSV import step:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { ok: false, errorMessage };
  }
}

async function loadImportJob(importId: string) {
  const csvImport = await prisma.csvImport.findUnique({
    where: { id: importId },
    select: {
      id: true,
      integrationId: true,
      userId: true,
      chunkCount: true,
      status: true,
    },
  });
  if (!csvImport) return null;
  return {
    importId: csvImport.id,
    integrationId: csvImport.integrationId,
    userId: csvImport.userId,
    chunkCount: csvImport.chunkCount,
    status: csvImport.status,
  };
}

async function readPlanAndFailures(importId: string) {
  const csvImport = await prisma.csvImport.findUniqueOrThrow({
    where: { id: importId },
    select: { plan: true, failures: true },
  });
  return {
    plan: importPlanSchema.parse(csvImport.plan),
    recordedFailures: recordedFailuresSchema.parse(csvImport.failures),
  };
}

async function readNameSpellings(job: ImportJob) {
  const manufacturerSpellings = new Map<string, string>();
  const productSpellings = new Map<string, string>();
  for (let chunkIndex = 0; chunkIndex < job.chunkCount; chunkIndex++) {
    const rows = await getChunk(job.importId, chunkIndex);
    for (const row of rows) {
      if (row.manufacturer === null) continue;
      const manufacturerKey = normalizeNameKey(row.manufacturer);
      if (!manufacturerSpellings.has(manufacturerKey)) {
        manufacturerSpellings.set(manufacturerKey, row.manufacturer);
      }
      if (row.product === null) continue;
      const modelKey = productKey(row.manufacturer, row.product);
      if (!productSpellings.has(modelKey)) {
        productSpellings.set(modelKey, row.product);
      }
    }
  }
  return { manufacturerSpellings, productSpellings };
}

async function saveAliasesFor(
  kind: "manufacturer" | "product",
  decisions: Record<string, NameDecision>,
  spellingByNameKey: Map<string, string>,
  addAlias: (id: string, alias: string) => Promise<void>,
): Promise<number> {
  let skippedCount = 0;
  for (const [nameKey, decision] of Object.entries(decisions)) {
    const spelling = spellingByNameKey.get(nameKey);
    if (decision.kind !== "existing" || spelling === undefined) continue;
    const spellingNamesAnother = await nameBelongsToAnother(
      kind,
      spelling,
      decision.id,
    );
    if (spellingNamesAnother) {
      skippedCount++;
      continue;
    }
    await addAlias(decision.id, spelling);
  }
  return skippedCount;
}

async function saveConfirmedAliases(job: ImportJob) {
  const { plan } = await readPlanAndFailures(job.importId);
  const { manufacturerSpellings, productSpellings } =
    await readNameSpellings(job);
  const skippedManufacturerAliases = await saveAliasesFor(
    "manufacturer",
    plan.nameDecisions.manufacturers,
    manufacturerSpellings,
    addManufacturerAlias,
  );
  const skippedProductAliases = await saveAliasesFor(
    "product",
    plan.nameDecisions.products,
    productSpellings,
    addProductAlias,
  );
  return { skippedManufacturerAliases, skippedProductAliases };
}

async function recordFileLevelFailures(job: ImportJob) {
  const fileRows: StagedRow[] = [];
  const fileContext: MatchContext = { assets: new Map() };
  for (let chunkIndex = 0; chunkIndex < job.chunkCount; chunkIndex++) {
    const chunkRows = await getChunk(job.importId, chunkIndex);
    const chunkContext = await loadMatchContext(chunkRows, {
      excludeAssetsAddedByImportId: job.importId,
    });
    for (const row of chunkRows) fileRows.push(row);
    for (const [assetId, asset] of chunkContext.assets) {
      fileContext.assets.set(assetId, asset);
    }
  }

  const outcomes = matchRowsToDevices(
    fileRows,
    fileContext,
    findInFileConflicts(fileRows),
  );
  const fileLevelFailures: ImportFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind !== "fail") continue;
    fileLevelFailures.push({
      rowNumber: outcome.rowNumber,
      reason: outcome.reason,
    });
  }

  await prisma.csvImport.update({
    where: { id: job.importId },
    data: {
      failures: fileLevelFailures,
      failedCount: fileLevelFailures.length,
    },
  });
  return { failedCount: fileLevelFailures.length };
}

async function applyStagedChunk(
  job: ImportJob,
  chunkIndex: number,
  appliedBeforeChunk: AppliedCounts,
) {
  const { plan, recordedFailures } = await readPlanAndFailures(job.importId);
  const recordedReasonByRow = new Map(
    recordedFailures.map((failure) => [failure.rowNumber, failure.reason]),
  );
  const rows = await getChunk(job.importId, chunkIndex);
  const context = await loadMatchContext(rows, {
    excludeAssetsAddedByImportId: job.importId,
  });
  const canonicalNames = await loadCanonicalNames(plan.nameDecisions);
  const outcomes = matchRowsToDevices(rows, context, recordedReasonByRow);

  const saveAppliedCounts = async (appliedInChunk: AppliedCounts) => {
    await prisma.csvImport.update({
      where: { id: job.importId },
      data: {
        addedCount: appliedBeforeChunk.added + appliedInChunk.added,
        linkedCount: appliedBeforeChunk.linked + appliedInChunk.linked,
      },
    });
  };

  const chunkResult = await applyChunk({
    importId: job.importId,
    integrationId: job.integrationId,
    userId: job.userId,
    rows,
    outcomes,
    context,
    canonicalNames,
    onProgress: saveAppliedCounts,
  });
  const newFailures = chunkResult.failures.filter(
    (failure) => !recordedReasonByRow.has(failure.rowNumber),
  );
  const failuresSoFar = [...recordedFailures, ...newFailures];

  await prisma.csvImport.update({
    where: { id: job.importId },
    data: {
      addedCount: appliedBeforeChunk.added + chunkResult.added,
      linkedCount: appliedBeforeChunk.linked + chunkResult.linked,
      failedCount: failuresSoFar.length,
      failures: failuresSoFar,
    },
  });
  return {
    added: chunkResult.added,
    linked: chunkResult.linked,
    failed: newFailures.length,
  };
}

function finalStatus(
  counts: ImportCounts,
  stepErrorMessage: string | null,
): CsvImportStatus {
  if (stepErrorMessage !== null) return CsvImportStatus.Failed;
  if (counts.failedCount === 0) return CsvImportStatus.Succeeded;
  const appliedCount = counts.addedCount + counts.linkedCount;
  return appliedCount === 0
    ? CsvImportStatus.Failed
    : CsvImportStatus.PartiallyFailed;
}

async function finishImport(job: ImportJob, stepErrorMessage: string | null) {
  const counts = await prisma.csvImport.findUniqueOrThrow({
    where: { id: job.importId },
    select: {
      totalRows: true,
      addedCount: true,
      linkedCount: true,
      failedCount: true,
    },
  });
  const status = finalStatus(counts, stepErrorMessage);
  const finishedAt = new Date();

  await prisma.csvImport.update({
    where: { id: job.importId },
    data: { status, finishedAt, errorMessage: stepErrorMessage },
  });

  const succeeded = status === CsvImportStatus.Succeeded;
  const failureSummary =
    stepErrorMessage ??
    `${counts.failedCount} of ${counts.totalRows} rows failed`;
  await upsertResourceSync(
    job.integrationId,
    ResourceType.Asset,
    {
      message: succeeded ? "success" : failureSummary,
      createdItemsCount: counts.addedCount,
      updatedItemsCount: counts.linkedCount,
      shouldRetry: !succeeded,
      syncedAt: finishedAt.toISOString(),
    },
    finishedAt,
  );

  return {
    status,
    added: counts.addedCount,
    linked: counts.linkedCount,
    failed: counts.failedCount,
  };
}

export const applyCsvImportFn = inngest.createFunction(
  {
    id: "apply-csv-import",
    concurrency: { key: "event.data.importId", limit: 1 },
    onFailure: async ({ event, error }) => {
      const { importId } = event.data.event.data as { importId: string };
      const failedJob = await loadImportJob(importId);
      if (failedJob) await finishImport(failedJob, error.message);
    },
  },
  { event: CSV_IMPORT_EVENT },
  async ({ event, step }) => {
    const { importId } = event.data as { importId: string };

    const loaded = await step.run("load-import", () => loadImportJob(importId));
    if (!loaded) {
      throw new NonRetriableError(`CSV import ${importId} not found`);
    }
    if (loaded.status !== CsvImportStatus.Queued) {
      return { skipped: true, reason: `Import is ${loaded.status}` };
    }
    const job: ImportJob = {
      importId: loaded.importId,
      integrationId: loaded.integrationId,
      userId: loaded.userId,
      chunkCount: loaded.chunkCount,
    };

    const claimedImport = await step.run("mark-running", async () => {
      const { count } = await prisma.csvImport.updateMany({
        where: { id: job.importId, status: CsvImportStatus.Queued },
        data: { status: CsvImportStatus.Running },
      });
      return count === 1;
    });
    if (!claimedImport) {
      return {
        skipped: true,
        reason: "Another run already started this import",
      };
    }

    const aliases = await step.run("save-aliases", () =>
      settle(() => saveConfirmedAliases(job)),
    );
    let stepErrorMessage = aliases.ok ? null : aliases.errorMessage;

    if (stepErrorMessage === null) {
      const fileCheck = await step.run("check-file", () =>
        settle(() => recordFileLevelFailures(job)),
      );
      stepErrorMessage = fileCheck.ok ? null : fileCheck.errorMessage;
    }

    let appliedSoFar: AppliedCounts = { added: 0, linked: 0 };
    for (
      let chunkIndex = 0;
      chunkIndex < job.chunkCount && stepErrorMessage === null;
      chunkIndex++
    ) {
      const appliedBeforeChunk = appliedSoFar;
      const chunk = await step.run(`apply-chunk-${chunkIndex}`, () =>
        settle(() => applyStagedChunk(job, chunkIndex, appliedBeforeChunk)),
      );
      if (!chunk.ok) {
        stepErrorMessage = chunk.errorMessage;
        continue;
      }
      appliedSoFar = {
        added: appliedBeforeChunk.added + chunk.value.added,
        linked: appliedBeforeChunk.linked + chunk.value.linked,
      };
    }

    const finished = await step.run("finish", () =>
      finishImport(job, stepErrorMessage),
    );

    const everyRowApplied = finished.status === CsvImportStatus.Succeeded;
    if (everyRowApplied) {
      await step.run("delete-staged-rows", () =>
        settle(() => deleteChunks(job.importId, job.chunkCount)),
      );
    }
    return finished;
  },
);
