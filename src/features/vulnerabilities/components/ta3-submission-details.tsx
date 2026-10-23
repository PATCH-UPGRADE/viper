"use client";

import { ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ta3SubmissionResponse } from "../types";

type Submission = Ta3SubmissionResponse;

/** One link per distinct exploit repository the vulnerability's TA3 submissions name. */
export function ExploitLinks({ submissions }: { submissions: Submission[] }) {
  const uris = [
    ...new Set(
      submissions.flatMap((s) => (s.exploitUri ? [s.exploitUri] : [])),
    ),
  ];
  return (
    <ul className="flex flex-col gap-1">
      {uris.map((uri) => (
        <li key={uri}>
          <a
            href={uri}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
          >
            {uri}
            <ExternalLinkIcon className="size-3" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export const hasExploitLinks = (submissions: Submission[]) =>
  submissions.some((s) => s.exploitUri);

/** Each TA3 submission's SARIF log, headed by when it was submitted. */
export function SarifBlocks({
  submissions,
  className,
}: {
  submissions: Submission[];
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {submissions.map((submission) => (
        <div key={submission.id} className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            Submitted {submission.createdAt.toLocaleString()}
          </div>
          <pre
            className={cn(
              // Wrapped, not scrolled: inside a drawer's ScrollArea, a line that can't
              // wrap widens the whole tab instead of scrolling.
              "text-xs bg-muted p-3 rounded whitespace-pre-wrap break-all",
              className,
            )}
          >
            {JSON.stringify(submission.sarif, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
