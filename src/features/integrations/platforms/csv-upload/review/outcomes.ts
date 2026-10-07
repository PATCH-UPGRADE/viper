import type { RowOutcome } from "../contract";

export interface RowFailure {
  rowNumber: number;
  reason: string;
}

export interface OutcomeSummary {
  addedRowNumbers: number[];
  linkedAssetIds: string[];
  failures: RowFailure[];
}

export const alreadyLinkedReason = (firstRowNumber: number): string =>
  `Row ${firstRowNumber} already links to this device`;

export const summarizeOutcomes = (
  outcomes: RowOutcome[],
  conflicts: Map<number, string>,
): OutcomeSummary => {
  const outcomesInFileOrder = [...outcomes].sort(
    (first, second) => first.rowNumber - second.rowNumber,
  );
  const summary: OutcomeSummary = {
    addedRowNumbers: [],
    linkedAssetIds: [],
    failures: [],
  };
  const firstRowLinkingAsset = new Map<string, number>();

  for (const outcome of outcomesInFileOrder) {
    const conflictReason = conflicts.get(outcome.rowNumber);
    if (conflictReason) {
      summary.failures.push({
        rowNumber: outcome.rowNumber,
        reason: conflictReason,
      });
    } else if (outcome.kind === "fail") {
      summary.failures.push({
        rowNumber: outcome.rowNumber,
        reason: outcome.reason,
      });
    } else if (outcome.kind === "add") {
      summary.addedRowNumbers.push(outcome.rowNumber);
    } else {
      const firstRowNumber = firstRowLinkingAsset.get(outcome.assetId);
      if (firstRowNumber !== undefined) {
        summary.failures.push({
          rowNumber: outcome.rowNumber,
          reason: alreadyLinkedReason(firstRowNumber),
        });
      } else {
        firstRowLinkingAsset.set(outcome.assetId, outcome.rowNumber);
        summary.linkedAssetIds.push(outcome.assetId);
      }
    }
  }
  return summary;
};
