"use client";

import {
  ChevronRight,
  ExternalLinkIcon,
  FileDownIcon,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { EXPORTS } from "@/features/reports/components/report-detail";

/**
 * Report attachment pill + preview modal for the generic (non-/reports)
 * chat — shown once write_report has completed for the current thread.
 * Self-guards on its own props so the caller doesn't need to duplicate that
 * check.
 */
export function ReportAttachment({
  threadId,
  title,
  report,
}: {
  threadId: string | null;
  title: string | null;
  report: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!threadId || !report) return null;
  const reportTitle = title || "Untitled report";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-4 mb-2 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm shadow-sm hover:bg-accent"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{reportTitle}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Full-height, actions pinned at the bottom — consistent with the
          chat panel's own fullscreen Dialog (see isFullscreen below). */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-full w-full min-w-1/2 flex-col gap-0 p-0">
          <DialogHeader className="border-b bg-muted px-4 py-3">
            <DialogTitle>{reportTitle}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <MarkdownWithTablesWrapper>{report}</MarkdownWithTablesWrapper>
          </div>

          <DialogFooter className="border-t px-4 py-3 sm:justify-end">
            {EXPORTS.map(([format, label]) => (
              <Button key={format} variant="outline" size="sm" asChild>
                <a
                  href={`/api/reports/${threadId}/export?format=${format}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileDownIcon className="size-4" />
                  {label}
                </a>
              </Button>
            ))}
            <Button size="sm" asChild>
              <Link href={`/reports/${threadId}`}>
                Open in Reports
                <ExternalLinkIcon className="size-4" />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
