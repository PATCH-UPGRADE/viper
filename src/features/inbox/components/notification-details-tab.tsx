// TODO(VW-499): Fix changes after VW-427
"use client";

import { format } from "date-fns";
import { ExternalLinkIcon, MailIcon, Unlink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { TlpBadge } from "@/components/tlp-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardTrigger,
} from "@/components/ui/collapsible-card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  NotificationDetailSource,
  NotificationDetailWithRelations,
  RawEmailPayload,
} from "../types";
import { EmailSourceModal } from "./email-source-modal";
import {
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";

type DeviceGroupMapping =
  NotificationDetailWithRelations["deviceGroupsMatchings"][number];

// ---------------------------------------------------------------------------
// SourceReference
// ---------------------------------------------------------------------------

function SourceReference({ source }: { source: NotificationDetailSource }) {
  const [open, setOpen] = useState(false);
  const raw =
    source.channel === "Email"
      ? (source.raw as unknown as RawEmailPayload)
      : null;
  const label = raw?.data?.subject ?? source.channel;

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
  // Resolved by mappingUrlExtension from the platform's `notifications`
  // resource module. If one doesn't exist, render the label unlinked
  // rather than an anchor to nowhere.
  const href = source.mapping?.webUrl;
  if (!href) {
    return <span className="truncate max-w-xs text-sm">{label}</span>;
  }

  return (
    <a
      href={href}
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
// Details tab
// ---------------------------------------------------------------------------

export function NotificationDetailsTab({
  notification,
  firstReceived,
}: {
  notification: NotificationDetailWithRelations;
  firstReceived: Date;
}) {
  const [rejecting, setRejecting] = useState<DeviceGroupMapping | null>(null);
  const [comment, setComment] = useState("");
  const markMatchIncorrect = useMarkMatchIncorrect();

  const sources = notification.sourceLinks.map((link) => link.sourceRecord);
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
        sources.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sources.map((source) => (
              <SourceReference key={source.id} source={source} />
            ))}
          </div>
        ),
    },
  ];

  const withAssets = notification.deviceGroupsMatchings.filter(
    (m) => m.assetCount > 0,
  );

  // Group matchings by manufacturer (first-seen order) so the manufacturer cell can span
  // all of that manufacturer's product rows in the table below.
  const manufacturerGroups = withAssets.reduce<
    Map<string, DeviceGroupMapping[]>
  >((groups, m) => {
    const manufacturer =
      displayName(m.deviceGroupMatching.manufacturer) ?? "Unknown manufacturer";
    const existing = groups.get(manufacturer);
    if (existing) existing.push(m);
    else groups.set(manufacturer, [m]);
    return groups;
  }, new Map());

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

  const hasAssets = withAssets.length > 0;

  return (
    <>
      <HospitalImpactCard notification={notification} />
      <NotificationSummaryCard notification={notification} />

      {/* Affected Products */}
      {hasAssets && (
        <CollapsibleCard defaultOpen>
          <CollapsibleCardTrigger>Affected Products</CollapsibleCardTrigger>
          <CollapsibleCardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Affected Versions</TableHead>
                  <TableHead className="text-right">Affected Assets</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...manufacturerGroups.entries()].map(
                  ([manufacturer, matchings]) =>
                    matchings.map((m, index) => (
                      <TableRow key={m.id}>
                        {index === 0 && (
                          <TableCell
                            rowSpan={matchings.length}
                            className="border-r align-top font-semibold"
                          >
                            {manufacturer}
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
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}

      {/* Details */}
      <CollapsibleCard defaultOpen>
        <CollapsibleCardTrigger>Details</CollapsibleCardTrigger>
        <CollapsibleCardContent>
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
        </CollapsibleCardContent>
      </CollapsibleCard>

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
