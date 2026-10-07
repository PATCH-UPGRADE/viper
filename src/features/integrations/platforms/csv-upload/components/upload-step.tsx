"use client";

import { SparklesIcon, UploadIcon } from "lucide-react";
import { type DragEvent, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SAMPLE_ROW_COUNT } from "../contract";
import {
  type CsvFileProblem,
  parseCsvFile,
  problemBeforeReading,
} from "../review/csv-file";
import { formatCount, formatFileSize } from "../review/labels";
import { ImportFooter, StepHeading, StepLayout } from "./import-frame";

export interface LoadedFile {
  name: string;
  sizeBytes: number;
  headers: string[];
  rows: string[][];
}

const showFileProblem = (fileName: string, problem: CsvFileProblem) => {
  if (problem.kind === "notCsv") {
    toast.error(`${fileName} isn't a CSV file`, {
      description: "Export as CSV, or in Excel use File → Save As → CSV.",
    });
  } else if (problem.kind === "noRows") {
    toast.error(`${fileName} has no rows`, {
      description: "The file has a header row but no devices under it.",
    });
  } else {
    toast.error(`${fileName} is ${formatFileSize(problem.sizeBytes)}`, {
      description:
        "The limit is 4 MB. Split the file, for example by building, and import each part.",
    });
  }
};

const readCsvFile = async (browserFile: File): Promise<LoadedFile | null> => {
  const problemFromNameOrSize = problemBeforeReading(browserFile);
  if (problemFromNameOrSize) {
    showFileProblem(browserFile.name, problemFromNameOrSize);
    return null;
  }
  const { headers, rows } = parseCsvFile(await browserFile.text());
  if (rows.length === 0) {
    showFileProblem(browserFile.name, { kind: "noRows" });
    return null;
  }
  return {
    name: browserFile.name,
    sizeBytes: browserFile.size,
    headers,
    rows,
  };
};

const RawPreview = ({ file }: { file: LoadedFile }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-semibold">First 5 rows</span>
      <span className="text-sm text-muted-foreground">
        Exactly as they are in your file
      </span>
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {file.headers.map((header) => (
              <TableHead key={header} className="font-mono text-xs">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {file.rows.slice(0, SAMPLE_ROW_COUNT).map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {file.headers.map((header, columnIndex) => (
                <TableCell key={header}>{row[columnIndex] ?? ""}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

export const UploadStep = ({
  sourceName,
  defaultSourceName,
  file,
  onSourceNameChange,
  onFileLoaded,
  onCancel,
  onAnalyze,
}: {
  sourceName: string;
  defaultSourceName: string;
  file: LoadedFile | null;
  onSourceNameChange: (sourceName: string) => void;
  onFileLoaded: (file: LoadedFile) => void;
  onCancel: () => void;
  onAnalyze: () => void;
}) => {
  const sourceNameId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = async (browserFile: File | undefined) => {
    if (!browserFile) return;
    const loaded = await readCsvFile(browserFile);
    if (loaded) onFileLoaded(loaded);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void loadFile(event.dataTransfer.files[0]);
  };

  return (
    <StepLayout
      footer={
        <ImportFooter
          left={
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          }
          hint={file ? undefined : "Choose a file first"}
          right={
            <Button disabled={!file} onClick={onAnalyze}>
              <SparklesIcon />
              Analyze file
            </Button>
          }
        />
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <StepHeading
          title="Import devices from a CSV file"
          description={
            file
              ? undefined
              : "VIPER reads your columns and asks you to check anything it isn't sure about. Nothing is saved until the last step."
          }
        />
        <div className="flex flex-col gap-2">
          <label
            htmlFor={sourceNameId}
            className="flex items-baseline gap-1.5 text-sm font-medium"
          >
            What system is this export from?
            <span className="text-[13px] font-normal text-muted-foreground">
              Optional
            </span>
          </label>
          <Input
            id={sourceNameId}
            value={sourceName}
            maxLength={100}
            placeholder="e.g. CSV assets upload"
            onChange={(event) => onSourceNameChange(event.target.value)}
          />
          <span className="text-[13px] text-muted-foreground">
            If you leave this empty, it's called{" "}
            <strong className="font-medium text-foreground">
              {defaultSourceName}
            </strong>
            .
          </span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {file ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-sm">{file.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {formatCount(file.rows.length)} rows ·{" "}
                  {formatCount(file.headers.length)} columns ·{" "}
                  {formatFileSize(file.sizeBytes)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                Replace file
              </Button>
            </div>
            <RawPreview file={file} />
          </>
        ) : (
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed bg-muted/30 px-6 py-12 text-center focus-within:ring-2 focus-within:ring-ring"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadIcon className="size-5" />
            </span>
            <span className="text-[15px] font-medium">
              Drop a .csv file here, or{" "}
              <span className="text-primary underline-offset-4 hover:underline">
                browse
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              CSV, up to 4 MB
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                void loadFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </StepLayout>
  );
};
