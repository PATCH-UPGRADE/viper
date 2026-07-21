"use client";

import { format } from "date-fns";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  HeartIcon,
  MailIcon,
  Unlink,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { TlpBadge } from "@/components/tlp-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import { displayName } from "@/lib/markdown/device-group";
import { useMarkMatchIncorrect } from "../hooks/use-notifications";
import {
  hospitalImpactSchema,
  type NotificationDetailSource,
  type NotificationDetailWithRelations,
  type RawEmailPayload,
} from "../types";

type DeviceGroupMapping =
  NotificationDetailWithRelations["deviceGroupsMatchings"][number];

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
  const raw = source.raw as unknown as RawEmailPayload;
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
                    { label: "From", value: raw.data?.from ?? "—" },
                    { label: "Subject", value: raw.data?.subject ?? "—" },
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
    source.channel === "Email"
      ? (source.raw as unknown as RawEmailPayload)
      : null;
  const label = raw?.data?.subject ?? source.referenceUrl ?? source.channel;

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
  // {} is truthy — treat an empty/invalid object as "not triaged yet".
  const impactParse = hospitalImpactSchema.safeParse(
    notification.hospitalImpact,
  );
  const impact = impactParse.success ? impactParse.data : null;
  const hasImpact =
    impact !== null &&
    (impact.byline.trim() !== "" || impact.impactStatement.trim() !== "");
  const [rejecting, setRejecting] = useState<DeviceGroupMapping | null>(null);
  const [comment, setComment] = useState("");
  const markMatchIncorrect = useMarkMatchIncorrect();

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

  const withAssets = notification.deviceGroupsMatchings.filter(
    (m) => m.assetCount > 0,
  );

  // Group matchings by vendor (first-seen order) so the vendor cell can span
  // all of that vendor's product rows in the table below.
  const vendorGroups = withAssets.reduce<Map<string, DeviceGroupMapping[]>>(
    (groups, m) => {
      const vendor =
        displayName(m.deviceGroupMatching.vendor) ?? "Unknown vendor";
      const existing = groups.get(vendor);
      if (existing) existing.push(m);
      else groups.set(vendor, [m]);
      return groups;
    },
    new Map(),
  );

  const closeDialog = () => {
    setRejecting(null);
    setComment("");
  };

  const confirmUnlink = async (commentToSave: string | undefined) => {
    if (!rejecting) return;
    const label = deviceGroupMatchingLabel(rejecting.deviceGroupMatching);
    try {
      await markMatchIncorrect.mutateAsync({
        targetType: "NotificationDeviceGroupMapping",
        targetId: rejecting.id,
        notificationId: notification.id,
        comment: commentToSave,
      });
      toast.success(`${label} unlinked from notification`);
      closeDialog();
    } catch {
      // Failure toast is surfaced by useMarkMatchIncorrect's onError; keep the
      // dialog open so the user can retry.
    }
  };

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
                    <p className="mt-1 text-sm font-medium">
                      {impact.careAreas || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Likelihood
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {impact.likelihood || "—"}
                    </p>
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

      {/* Affected Products */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Affected Products</CardTitle>
          <span className="text-muted-foreground text-sm">
            {withAssets.length} of {notification.deviceGroupsMatchings.length}{" "}
            listed
          </span>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Affected Versions</TableHead>
                <TableHead className="text-right">Affected Assets</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...vendorGroups.entries()].map(([vendor, matchings]) =>
                matchings.map((m, index) => (
                  <TableRow key={m.id}>
                    {index === 0 && (
                      <TableCell
                        rowSpan={matchings.length}
                        className="border-r align-top font-semibold"
                      >
                        {vendor}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {displayName(m.deviceGroupMatching.product)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {displayName(m.deviceGroupMatching.version) ??
                          m.deviceGroupMatching.versionRange}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {m.assetCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setRejecting(m)}
                        aria-label="Unlink this device group"
                      >
                        <Unlink className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="w-full min-w-0 sm:w-fit sm:min-w-80 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 wrap-anywhere">
              <Unlink className="size-4 text-destructive shrink-0" />
              Unlink{" "}
              {rejecting
                ? deviceGroupMatchingLabel(rejecting.deviceGroupMatching)
                : ""}
              ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rejecting &&
              "This product should not have been attached to this notification"}
          </p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment describing the error (optional)"
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeDialog}
              disabled={markMatchIncorrect.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmUnlink(comment.trim() || undefined)}
              disabled={markMatchIncorrect.isPending}
            >
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
