"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { AssetStatus } from "@/generated/prisma";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { cn, plural } from "@/lib/utils";
import {
  type AssetImportField,
  type ColumnMapping,
  type LinkedAsset,
  type MatchKeysRow,
  type MatchNamesOutput,
  type NameDecision,
  type NameDecisions,
  PREVIEW_REQUEST_BYTES,
  type RowOutcome,
  type StagedRow,
  type StatusValues,
} from "../contract";
import {
  useCreateImport,
  useImportStatus,
  useMatchNames,
  usePreviewImport,
  useStageRows,
  useStartImport,
  useSuggestMapping,
} from "../hooks/use-csv-import";
import { chunkBySize } from "../review/chunks";
import {
  assignColumn,
  type ColumnSuggestion,
  columnSuggestionFrom,
  columnsToCheck,
  columnsToConfirm,
  requiredFieldsNotSet,
  setConstant,
  statusValueRows,
} from "../review/columns";
import {
  countRowsByValue,
  distinctValuesByHeader,
  sampleRowsFor,
} from "../review/csv-file";
import {
  type EditedRows,
  fieldsToLeaveOut,
  INVALID_VALUE_KINDS,
  type IssueChoice,
  type IssueGroup,
  issueKeysFor,
  rememberEditedRow,
} from "../review/issues";
import { FIELD_LABELS } from "../review/labels";
import {
  countNames,
  exactMatchDecisions,
  finalNameDecisions,
  matchNamesInputFor,
  nameReviewFor,
  openNameQuestions,
  summarizeNameDecisions,
} from "../review/names";
import { type OutcomeSummary, summarizeOutcomes } from "../review/outcomes";
import { importReviewFor, matchKeysOf } from "../review/plan";
import { ColumnsStep } from "./columns-step";
import { ConfirmStep } from "./confirm-step";
import {
  ImportFooter,
  ImportHeader,
  type ImportStep,
  ProgressPanel,
  ReviewNav,
  type ReviewNavItem,
  type ReviewStep,
  StepLayout,
} from "./import-frame";
import {
  importToastId,
  showImportProgressToast,
} from "./import-progress-toast";
import { IssuesStep } from "./issues-step";
import { type NameKind, NamesStep, pickedNameKey } from "./names-step";
import { ResultStep } from "./result-step";
import { type LoadedFile, UploadStep } from "./upload-step";

type Stage =
  | "upload"
  | "analyzing"
  | ReviewStep
  | "matchingNames"
  | "previewing"
  | "confirm"
  | "applying";

interface PreviewResult {
  summary: OutcomeSummary;
  linkedAssets: LinkedAsset[];
}

const NO_DECISIONS: NameDecisions = { manufacturers: {}, products: {} };
const NO_MATCHES: MatchNamesOutput = { manufacturers: [], products: [] };
const REVIEW_ORDER: ReviewStep[] = ["columns", "names", "issues"];
const UNTIL_DISMISSED = Number.POSITIVE_INFINITY;

const stepFor = (stage: Stage): ImportStep => {
  if (stage === "upload") return 1;
  if (stage === "previewing" || stage === "confirm") return 3;
  if (stage === "applying") return "finished";
  return 2;
};

const showError = (title: string, error: unknown) =>
  toast.error(title, {
    description: error instanceof Error ? error.message : undefined,
  });

const answersWithExactMatches = (
  matches: MatchNamesOutput,
  previous: NameDecisions,
): NameDecisions => {
  const exact = exactMatchDecisions(matches);
  return {
    manufacturers: { ...exact.manufacturers, ...previous.manufacturers },
    products: { ...exact.products, ...previous.products },
  };
};

const previewInChunks = async (
  importRows: StagedRow[],
  previewChunk: (rows: MatchKeysRow[]) => Promise<{
    outcomes: RowOutcome[];
    linkedAssets: LinkedAsset[];
  }>,
) => {
  const outcomes: RowOutcome[] = [];
  const linkedAssetsById = new Map<string, LinkedAsset>();
  for (const chunk of chunkBySize(
    importRows.map(matchKeysOf),
    PREVIEW_REQUEST_BYTES,
  )) {
    const chunkPreview = await previewChunk(chunk);
    outcomes.push(...chunkPreview.outcomes);
    for (const asset of chunkPreview.linkedAssets) {
      linkedAssetsById.set(asset.id, asset);
    }
  }
  return { outcomes, linkedAssetsById };
};

export const CsvImportOverlay = ({
  open,
  initialImportId,
  onClose,
  onReopen,
  onStagingChange,
  onImportStarted,
}: {
  open: boolean;
  initialImportId: string | null;
  onClose: () => void;
  onReopen: () => void;
  onStagingChange: (isStaging: boolean) => void;
  onImportStarted: (importId: string) => void;
}) => {
  const router = useRouter();
  const [defaultSourceName] = useState(
    () => `CSV Assets Upload - ${format(new Date(), "MMM d, yyyy")}`,
  );
  const [stage, setStage] = useState<Stage>(
    initialImportId ? "applying" : "upload",
  );
  const [importId, setImportId] = useState<string | null>(initialImportId);
  const [sourceName, setSourceName] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [suggestion, setSuggestion] = useState<ColumnSuggestion | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [confirmedFields, setConfirmedFields] = useState<
    ReadonlySet<AssetImportField>
  >(new Set());
  const [chosenStatuses, setChosenStatuses] = useState<StatusValues>({});
  const [pickedStatusValues, setPickedStatusValues] = useState<
    ReadonlySet<string>
  >(new Set());
  const [nameMatches, setNameMatches] = useState<{
    namesSent: string;
    matches: MatchNamesOutput;
  } | null>(null);
  const [nameDecisions, setNameDecisions] =
    useState<NameDecisions>(NO_DECISIONS);
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  const [issueChoices, setIssueChoices] = useState<Record<string, IssueChoice>>(
    {},
  );
  const [editedIssueRows, setEditedIssueRows] = useState<
    Record<string, EditedRows>
  >({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isStaging, setIsStaging] = useState(false);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const stagedImportRef = useRef<{
    importId: string;
    everyChunkStaged: boolean;
  } | null>(null);

  const suggestMapping = useSuggestMapping();
  const matchNames = useMatchNames();
  const previewImport = usePreviewImport();
  const createImport = useCreateImport();
  const stageRows = useStageRows();
  const startImport = useStartImport();
  const { data: importStatus } = useImportStatus(importId);
  useBeforeUnload(isStaging);

  useEffect(() => {
    if (open) setIsMinimizing(false);
  }, [open]);

  const sourceLabel = sourceName.trim() || defaultSourceName;
  const settledMapping = useDeferredValue(mapping);

  const review = useMemo(
    () => (file ? importReviewFor(file, settledMapping, chosenStatuses) : null),
    [file, settledMapping, chosenStatuses],
  );

  const statusHeader =
    mapping.status?.kind === "column" ? mapping.status.header : null;
  const statusRows = useMemo(
    () =>
      file && statusHeader
        ? statusValueRows(
            countRowsByValue(file.headers, file.rows, statusHeader),
            chosenStatuses,
            suggestion?.statusConfidence ?? {},
            pickedStatusValues,
          )
        : [],
    [file, statusHeader, chosenStatuses, suggestion, pickedStatusValues],
  );
  const fieldsToConfirm = columnsToConfirm(
    mapping,
    suggestion?.fieldConfidence ?? {},
    confirmedFields,
  );
  const columnChecks = columnsToCheck(
    mapping,
    suggestion?.fieldConfidence ?? {},
    confirmedFields,
    statusRows,
  );

  const importRows = review?.importRows ?? [];
  const nameCounts = useMemo(() => countNames(importRows), [importRows]);
  const matches = nameMatches?.matches ?? NO_MATCHES;
  const nameReview = nameReviewFor(matches, nameDecisions);
  const openNameCount = openNameQuestions(nameReview, nameDecisions);
  const issueKeys = review
    ? issueKeysFor(
        review.flaggedColumns,
        review.issueGroups,
        review.repeatedRows.length,
      )
    : [];
  const undecidedIssueCount = issueKeys.filter(
    (issueKey) => issueChoices[issueKey] === undefined,
  ).length;
  const requiredFieldsToSet = requiredFieldsNotSet(mapping).length;
  const openCountByStep: Record<ReviewStep, number> = {
    columns: requiredFieldsToSet + columnChecks.length,
    names: openNameCount,
    issues: undecidedIssueCount,
  };
  const openItems = REVIEW_ORDER.map((step) => ({
    step,
    count: openCountByStep[step],
  })).filter((openItem) => openItem.count > 0);

  const loadNameMatches = async (rowsToMatch: StagedRow[]) => {
    const namesToMatch = matchNamesInputFor(rowsToMatch);
    const namesSent = JSON.stringify(namesToMatch);
    if (nameMatches?.namesSent === namesSent) return;
    const freshMatches =
      namesToMatch.manufacturers.length === 0
        ? NO_MATCHES
        : await matchNames.mutateAsync(namesToMatch);
    setNameMatches({ namesSent, matches: freshMatches });
    setNameDecisions((previous) =>
      answersWithExactMatches(freshMatches, previous),
    );
  };

  const preloadNameMatches = (rowsToMatch: StagedRow[]) =>
    loadNameMatches(rowsToMatch).catch(() => undefined);

  const analyzeFile = async () => {
    if (!file) return;
    setStage("analyzing");
    try {
      const suggestionFromAi = await suggestMapping.mutateAsync({
        headers: file.headers,
        sampleRows: sampleRowsFor(file.headers, file.rows),
        distinctValues: distinctValuesByHeader(file.headers, file.rows),
      });
      const suggested = columnSuggestionFrom(suggestionFromAi, file.headers);
      const suggestedReview = importReviewFor(
        file,
        suggested.mapping,
        suggested.statusValues,
      );
      await preloadNameMatches(suggestedReview.importRows);
      setSuggestion(suggested);
      setMapping(suggested.mapping);
      setChosenStatuses(suggested.statusValues);
      setConfirmedFields(new Set());
      setPickedStatusValues(new Set());
      setStage("columns");
    } catch (error) {
      showError(`Couldn't analyze ${file.name}`, error);
      setStage("upload");
    }
  };

  const goToNames = async () => {
    setStage("matchingNames");
    try {
      await loadNameMatches(importRows);
      setStage("names");
    } catch (error) {
      showError("Couldn't check the manufacturer and product names", error);
      setStage("columns");
    }
  };

  const editCell = (
    group: Pick<IssueGroup, "field" | "kind">,
    rowNumber: number,
    header: string,
    value: string,
  ) => {
    if (!file || !review) return;
    const editedRowIndex = review.importRows.findIndex(
      (row) => row.rowNumber === rowNumber,
    );
    const editedColumnIndex = file.headers.indexOf(header);
    if (editedRowIndex === -1 || editedColumnIndex === -1) return;
    const rowsWithTheEdit = file.rows.map((cells, rowIndex) => {
      if (rowIndex !== editedRowIndex) return cells;
      return file.headers.map((_header, columnIndex) =>
        columnIndex === editedColumnIndex ? value : (cells[columnIndex] ?? ""),
      );
    });
    setFile({ ...file, rows: rowsWithTheEdit });
    setEditedIssueRows((previous) =>
      rememberEditedRow(previous, group, rowNumber),
    );
  };

  const goToConfirm = async () => {
    if (!review) return;
    stagedImportRef.current = null;
    setStage("previewing");
    try {
      await loadNameMatches(review.importRows);
      const { outcomes, linkedAssetsById } = await previewInChunks(
        review.importRows,
        (rows) => previewImport.mutateAsync({ rows }),
      );
      const summary = summarizeOutcomes(outcomes, review.conflicts);
      const linkedAssets = summary.linkedAssetIds.flatMap((assetId) => {
        const asset = linkedAssetsById.get(assetId);
        return asset ? [asset] : [];
      });
      setPreview({ summary, linkedAssets });
      setStage("confirm");
    } catch (error) {
      showError("Couldn't check which devices are already in VIPER", error);
      setStage("issues");
    }
  };

  const applyChanges = async () => {
    if (!file || !review) return;
    setIsStaging(true);
    onStagingChange(true);
    setIsMinimizing(true);
    setStage("applying");
    onClose();
    try {
      if (stagedImportRef.current === null) {
        const createdImport = await createImport.mutateAsync({
          mapping: review.planMapping,
          statusValues: chosenStatuses,
          nameDecisions: finalNameDecisions(matches, nameDecisions),
          sourceName: sourceLabel,
          fileName: file.name,
          headers: file.headers,
          rowCount: review.importRows.length,
        });
        stagedImportRef.current = {
          importId: createdImport.importId,
          everyChunkStaged: false,
        };
      }
      const stagedImport = stagedImportRef.current;
      const chunks = chunkBySize(review.importRows);
      if (!stagedImport.everyChunkStaged) {
        for (const [chunkIndex, rows] of chunks.entries()) {
          showImportProgressToast({
            importId: stagedImport.importId,
            title: `Uploading ${sourceLabel}…`,
            doneCount: chunkIndex,
            totalCount: chunks.length,
            unit: "part",
          });
          await stageRows.mutateAsync({
            importId: stagedImport.importId,
            chunkIndex,
            rows,
          });
        }
        stagedImport.everyChunkStaged = true;
      }
      await startImport.mutateAsync({
        importId: stagedImport.importId,
        chunkCount: chunks.length,
      });
      setImportId(stagedImport.importId);
      onImportStarted(stagedImport.importId);
    } catch (error) {
      if (stagedImportRef.current) {
        toast.dismiss(importToastId(stagedImportRef.current.importId));
      }
      toast.error("Couldn't start the import", {
        description: error instanceof Error ? error.message : undefined,
        duration: UNTIL_DISMISSED,
        closeButton: true,
        action: { label: "Back to review", onClick: onReopen },
      });
      setStage("confirm");
    } finally {
      setIsStaging(false);
      onStagingChange(false);
    }
  };

  const assignColumnToField = (
    header: string,
    field: AssetImportField | null,
  ) => {
    setMapping((previous) => assignColumn(previous, header, field));
    if (field) {
      setConfirmedFields((previous) => new Set(previous).add(field));
    }
  };

  const setFieldConstant = (field: AssetImportField, value: string) =>
    setMapping((previous) => setConstant(previous, field, value));

  const pickStatus = (value: string, status: AssetStatus | null) => {
    setChosenStatuses((previous) => ({ ...previous, [value]: status }));
    setPickedStatusValues((previous) => new Set(previous).add(value));
  };

  const decideName = (
    kind: NameKind,
    key: string,
    decision: NameDecision,
    pickedName?: string,
  ) => {
    setNameDecisions((previous) =>
      kind === "manufacturer"
        ? {
            ...previous,
            manufacturers: { ...previous.manufacturers, [key]: decision },
          }
        : { ...previous, products: { ...previous.products, [key]: decision } },
    );
    if (pickedName) {
      setPickedNames((previous) => ({
        ...previous,
        [pickedNameKey(kind, key)]: pickedName,
      }));
    }
  };

  const viewDevices = (integrationId: string) => {
    router.push(`/assets?source=${integrationId}`);
    onClose();
  };

  const reviewNavFor = (current: ReviewStep) => {
    const isPast = (step: ReviewStep) =>
      REVIEW_ORDER.indexOf(step) < REVIEW_ORDER.indexOf(current);
    const checkCount = columnChecks.length + requiredFieldsToSet;
    const items: ReviewNavItem[] = [
      {
        step: "columns",
        letter: "A",
        label: "Columns",
        status: checkCount > 0 ? `${checkCount} to check` : "Done",
        done: isPast("columns") && checkCount === 0,
      },
      {
        step: "names",
        letter: "B",
        label: "Manufacturers & products",
        status:
          openNameCount > 0
            ? `${openNameCount} ${plural("question", openNameCount)}`
            : "Done",
        done: isPast("names") && openNameCount === 0,
      },
      {
        step: "issues",
        letter: "C",
        label: "Data issues",
        status:
          undecidedIssueCount > 0 ? `${undecidedIssueCount} to decide` : "Done",
        done: false,
      },
    ];
    return <ReviewNav current={current} items={items} />;
  };

  const working = (title: string, description: string) => (
    <StepLayout
      footer={
        <ImportFooter
          left={
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          }
          right={null}
        />
      }
    >
      <ProgressPanel title={title} description={description} />
    </StepLayout>
  );

  const renderStage = () => {
    if (stage === "upload") {
      return (
        <UploadStep
          sourceName={sourceName}
          defaultSourceName={defaultSourceName}
          file={file}
          onSourceNameChange={setSourceName}
          onFileLoaded={(loadedFile) => {
            setFile(loadedFile);
            setIssueChoices({});
            setEditedIssueRows({});
          }}
          onCancel={onClose}
          onAnalyze={analyzeFile}
        />
      );
    }
    if (stage === "applying") {
      return (
        <ResultStep
          status={importStatus}
          nameSummary={
            nameMatches
              ? summarizeNameDecisions(
                  matches,
                  finalNameDecisions(matches, nameDecisions),
                )
              : null
          }
          onClose={onClose}
          onViewDevices={viewDevices}
        />
      );
    }
    if (!file || !review) return null;
    if (stage === "analyzing" || stage === "matchingNames") {
      return working(
        "Analyzing your file…",
        "This usually takes a few seconds.",
      );
    }
    if (stage === "previewing") {
      return working(
        "Checking which devices are already in VIPER…",
        "This usually takes a few seconds.",
      );
    }
    if (stage === "columns") {
      return (
        <ColumnsStep
          file={file}
          mapping={mapping}
          columnChecks={columnChecks}
          fieldsToConfirm={fieldsToConfirm}
          statusRows={statusRows}
          nav={reviewNavFor("columns")}
          onAssignColumn={assignColumnToField}
          onSetConstant={setFieldConstant}
          onPickStatus={pickStatus}
          onBack={() => setStage("upload")}
          onNext={goToNames}
        />
      );
    }
    if (stage === "names") {
      return (
        <NamesStep
          review={nameReview}
          counts={nameCounts}
          decisions={nameDecisions}
          pickedNames={pickedNames}
          openCount={openNameCount}
          nav={reviewNavFor("names")}
          onDecide={decideName}
          onBack={() => setStage("columns")}
          onNext={() => setStage("issues")}
        />
      );
    }
    if (stage === "issues") {
      return (
        <IssuesStep
          mapping={mapping}
          flaggedColumns={review.flaggedColumns}
          groups={review.issueGroups}
          repeatedRows={review.repeatedRows}
          rowsByNumber={review.rowsByNumber}
          headers={file.headers}
          choices={issueChoices}
          editedRows={editedIssueRows}
          onEditCell={editCell}
          onChoose={(issueKey, choice) =>
            setIssueChoices((previous) => ({
              ...previous,
              [issueKey]: choice,
            }))
          }
          nav={reviewNavFor("issues")}
          onBack={() => setStage("names")}
          onContinue={goToConfirm}
          onCancelImport={onClose}
        />
      );
    }
    if (!preview) return null;
    const addedRowNumbers = new Set(preview.summary.addedRowNumbers);
    const droppedHeaders = fieldsToLeaveOut(review.flaggedColumns).map(
      (field) => {
        const source = mapping[field];
        return source?.kind === "column" ? source.header : FIELD_LABELS[field];
      },
    );
    return (
      <ConfirmStep
        addedRows={review.importRows.filter((row) =>
          addedRowNumbers.has(row.rowNumber),
        )}
        linkedAssets={preview.linkedAssets}
        failures={preview.summary.failures}
        rowsByNumber={review.rowsByNumber}
        nameSummary={summarizeNameDecisions(
          matches,
          finalNameDecisions(matches, nameDecisions),
        )}
        invalidGroups={review.issueGroups.filter((group) =>
          INVALID_VALUE_KINDS.includes(group.kind),
        )}
        droppedHeaders={[...new Set(droppedHeaders)]}
        openItems={openItems}
        isApplying={isStaging}
        onBack={() => setStage(openItems[0]?.step ?? "issues")}
        onGoToStep={setStage}
        onApply={applyChanges}
      />
    );
  };

  const headerTitle =
    stage === "upload"
      ? "Import from CSV"
      : (importStatus?.sourceName ?? sourceLabel);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "flex max-h-[calc(100vh-4rem)] min-h-[min(42rem,calc(100vh-4rem))] w-[calc(100%-2rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]",
          isMinimizing &&
            "motion-safe:duration-500 motion-safe:ease-in motion-safe:data-[state=closed]:zoom-out-10! motion-safe:data-[state=closed]:slide-out-to-right-[42vw] motion-safe:data-[state=closed]:slide-out-to-bottom-[42vh]",
        )}
      >
        <ImportHeader
          title={headerTitle}
          fileName={
            stage === "upload"
              ? undefined
              : (file?.name ?? importStatus?.fileName)
          }
          currentStep={stepFor(stage)}
          onClose={onClose}
        />
        {renderStage()}
      </DialogContent>
    </Dialog>
  );
};
