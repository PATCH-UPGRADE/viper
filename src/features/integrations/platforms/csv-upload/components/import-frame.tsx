"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ImportStep = 1 | 2 | 3 | "finished";

export type ReviewStep = "columns" | "names" | "issues";

export interface ReviewNavItem {
  step: ReviewStep;
  letter: string;
  label: string;
  status: string;
  done: boolean;
}

const IMPORT_STEPS = [
  { step: 1, label: "Upload" },
  { step: 2, label: "Review" },
  { step: 3, label: "Confirm" },
] as const;

const isStepDone = (step: number, current: ImportStep) =>
  current === "finished" || step < current;

export const ImportHeader = ({
  title,
  fileName,
  currentStep,
  onClose,
}: {
  title: string;
  fileName?: string;
  currentStep: ImportStep;
  onClose: () => void;
}) => (
  <div className="flex items-center gap-4 border-b px-5 py-3">
    <div className="flex min-w-0 flex-1 flex-col">
      <DialogTitle className="truncate text-[15px] font-semibold">
        {title}
      </DialogTitle>
      {fileName && (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {fileName}
        </span>
      )}
    </div>
    <ol aria-label="Import steps" className="flex items-center gap-2.5">
      {IMPORT_STEPS.map(({ step, label }, index) => {
        const done = isStepDone(step, currentStep);
        const current = step === currentStep;
        return (
          <li key={step} className="flex items-center gap-2.5">
            {index > 0 && (
              <span aria-hidden="true" className="h-px w-7 bg-border" />
            )}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                done || current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-[22px] items-center justify-center rounded-full text-xs font-semibold",
                  current && "bg-primary text-primary-foreground",
                  done && "bg-primary/10 text-primary",
                  !done && !current && "border",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : step}
              </span>
              {label}
              {done && <span className="sr-only">(done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
    <div className="flex flex-1 justify-end">
      <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  </div>
);

export const ReviewNav = ({
  current,
  items,
}: {
  current: ReviewStep;
  items: ReviewNavItem[];
}) => (
  <nav
    aria-label="Review steps"
    className="flex w-62 shrink-0 flex-col gap-0.5 border-r bg-muted/30 p-3"
  >
    {items.map((item) => {
      const isCurrent = item.step === current;
      return (
        <div
          key={item.step}
          aria-current={isCurrent ? "step" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5",
            isCurrent && "bg-primary/10",
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
              isCurrent
                ? "bg-primary text-primary-foreground"
                : "border text-muted-foreground",
            )}
          >
            {item.done ? <CheckIcon className="size-3.5" /> : item.letter}
          </span>
          <span className="flex flex-col gap-px">
            <span
              className={cn(
                "text-sm",
                isCurrent ? "font-semibold" : "font-medium",
              )}
            >
              {item.label}
            </span>
            <span className="text-xs text-muted-foreground">{item.status}</span>
          </span>
        </div>
      );
    })}
    <p className="mt-auto px-3 py-2 text-xs text-muted-foreground">
      Nothing is saved until you click Apply changes.
    </p>
  </nav>
);

export const ImportFooter = ({
  left,
  hint,
  right,
}: {
  left?: ReactNode;
  hint?: ReactNode;
  right: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
    <div>{left}</div>
    <div className="flex items-center gap-3">
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      {right}
    </div>
  </div>
);

export const StepLayout = ({
  nav,
  footer,
  children,
}: {
  nav?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) => (
  <>
    <div className="flex min-h-0 flex-1">
      {nav}
      <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="flex min-h-full flex-col gap-5">{children}</div>
      </div>
    </div>
    {footer}
  </>
);

export const StepHeading = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    {eyebrow && (
      <span className="text-sm font-medium text-primary">{eyebrow}</span>
    )}
    <h3 className="text-[22px] font-semibold">{title}</h3>
    {description && (
      <p className="text-[15px] text-muted-foreground">{description}</p>
    )}
  </div>
);

export const OutlinedChoice = ({
  value,
  label,
  isChosen,
  asksToBePicked = false,
}: {
  value: string;
  label: string;
  isChosen: boolean;
  asksToBePicked?: boolean;
}) => {
  const optionId = useId();
  return (
    <Label
      htmlFor={optionId}
      className={cn(
        "flex cursor-pointer items-center rounded-md border px-3 py-2 text-[13px] font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        isChosen && "border-primary bg-primary/5",
        asksToBePicked && "animate-attention-glow motion-reduce:animate-none",
      )}
    >
      <RadioGroupItem id={optionId} value={value} className="sr-only" />
      {label}
    </Label>
  );
};

export const ColumnTag = ({ header }: { header: string }) => (
  <span className="mx-0.5 inline-flex max-w-60 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-px align-baseline font-mono text-[0.85em] font-medium text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
    <span className="truncate">{header}</span>
  </span>
);

export const ValueTag = ({ value }: { value: string }) => (
  <span className="inline-block max-w-60 truncate rounded bg-muted px-1.5 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-foreground">
    {value}
  </span>
);

export const ProgressPanel = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <output className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
    <Spinner className="size-8 text-primary" />
    <span className="text-base font-semibold">{title}</span>
    <span className="max-w-md text-sm text-muted-foreground">
      {description}
    </span>
  </output>
);
