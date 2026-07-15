"use client";

import { format } from "date-fns";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  HeartIcon,
  MailIcon,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { TlpBadge } from "@/components/tlp-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import {
  hospitalImpactSchema,
  type NotificationDetailSource,
  type NotificationDetailWithRelations,
  type RawEmailPayload,
} from "../types";

// ---------------------------------------------------------------------------
// EmailSourceModal
// ---------------------------------------------------------------------------

function EmailSourceModal({
  source,
  open,
  onOpenChange,
}: {
  source: NotificationDetailSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const raw = source.raw as RawEmailPayload;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Original source email</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-auto min-h-0">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    { label: "From", value: raw.from },
                    { label: "Subject", value: raw.subject ?? "—" },
                    {
                      label: "Date",
                      value: format(source.receivedAt, "PPP p"),
                    },
                  ] satisfies { label: string; value: string }[]
                ).map(({ label, value }) => (
                  <Fragment key={label}>
                    <dt className="font-medium text-muted-foreground">
                      {label}
                    </dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            </CardContent>
          </Card>
          {source.markdown && (
            <Card className="overflow-auto">
              <CardContent>
                <MarkdownWithTablesWrapper>
                  {source.markdown}
                </MarkdownWithTablesWrapper>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SourceReference
// ---------------------------------------------------------------------------

function SourceReference({ source }: { source: NotificationDetailSource }) {
  const [open, setOpen] = useState(false);
  const raw =
    source.channel === "Email" ? (source.raw as RawEmailPayload) : null;
  const label = raw?.subject ?? source.referenceUrl ?? source.channel;

  if (source.channel === "Email") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-sm text-primary hover:underline text-left"
        >
          <span className="truncate max-w-xs">{label}</span>
          <MailIcon className="size-3 shrink-0" />
        </button>
        <EmailSourceModal source={source} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <a
      href={source.referenceUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <span className="truncate max-w-xs">{label}</span>
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

export function NotificationOverviewTab({
  notification,
  firstReceived,
}: {
  notification: NotificationDetailWithRelations;
  firstReceived: Date;
}) {
  // hospitalImpact is jsonb (default {}). Parse it; treat a failed parse or an
  // empty object as "not triaged yet" and hide the card (note: {} is truthy).
  const impactParse = hospitalImpactSchema.safeParse(
    notification.hospitalImpact,
  );
  const impact = impactParse.success ? impactParse.data : null;
  const hasImpact =
    impact !== null &&
    (impact.byline.trim() !== "" || impact.impactStatement.trim() !== "");

  const detailRows: { label: string; content: ReactNode }[] = [
    {
      label: "TLP",
      content: notification.tlp ? <TlpBadge tlp={notification.tlp} /> : "—",
    },
    {
      label: "First Received",
      content: format(firstReceived, "PPP p"),
    },
    {
      label: "References",
      content:
        notification.sources.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {notification.sources.map((source) => (
              <SourceReference key={source.id} source={source} />
            ))}
          </div>
        ),
    },
  ];

  return (
    <>
      {/* Hospital Impact */}
      {hasImpact && impact && (
        <Card>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 px-6 text-left">
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              <HeartIcon className="size-4" />
              <span className="font-semibold">Hospital Impact</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-6 pt-4">
              <div className="flex flex-col gap-4">
                {impact.byline && (
                  <p className="font-semibold leading-snug">{impact.byline}</p>
                )}
                {impact.impactStatement && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {impact.impactStatement}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Care Areas
                    </p>
                    <p className="mt-1 text-sm">{impact.careAreas || "—"}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Likelihood
                    </p>
                    <p className="mt-1 text-sm">{impact.likelihood || "—"}</p>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Summary */}
      {notification.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{notification.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2 pr-3 w-48 align-top">
                    <Badge variant="secondary">{row.label}</Badge>
                  </td>
                  <td className="py-2 align-top text-muted-foreground">
                    {row.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
