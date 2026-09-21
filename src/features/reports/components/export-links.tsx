"use client";

import { FileDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const EXPORTS = [
  ["pdf", "PDF"],
  ["docx", "Word"],
] as const;

/** PDF/Word export buttons for a report thread — shared with the chat's report modal. */
export function ExportLinks({ threadId }: { threadId: string }) {
  return (
    <>
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
    </>
  );
}
