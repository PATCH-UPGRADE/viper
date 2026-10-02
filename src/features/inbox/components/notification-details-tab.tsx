// TODO(VW-499): Fix changes after VW-427
"use client";

import { format } from "date-fns";
import { ExternalLinkIcon, HeartIcon, MailIcon, Unlink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { SeverityBadge } from "@/components/severity-badge";
import { TlpBadge } from "@/components/tlp-badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { UtilizationGridList } from "@/features/assets/components/asset-utilization-grid";
import type { MatchFeedbackTargetType } from "@/generated/prisma";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import { displayName } from "@/lib/markdown/device-group";
import {
  useAffectedfAssetUtilization,
  useMarkMatchIncorrect,
} from "../hooks/use-notifications";
import type {
  NotificationDetailSource,
  NotificationDetailWithRelations,
  RawEmailPayload,
} from "../types";
import { EmailSourceModal } from "./email-source-modal";
import { NotificationActivityTimeline } from "./notification-activity-timeline";
import {
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";
import { nvdUrl, sourceLabel } from "./shared";

type DeviceGroupMapping =
  NotificationDetailWithRelations["deviceGroupsMatchings"][number];
type VulnerabilityMapping =
  NotificationDetailWithRelations["vulnerabilities"][number];

type RejectTarget = {
  targetType: MatchFeedbackTargetType;
  id: string;
  label: string;
  noun: "product" | "vulnerability";
};

// A vulnerability minted from a non-CVE identifier stores that identifier as
// the first sentence of its description.
function vulnerabilityLabel(mapping: VulnerabilityMapping): string {
  const { cveId, description } = mapping.vulnerability;
  return cveId ?? description?.split(". ")[0] ?? mapping.vulnerabilityId;
}

function UnlinkButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-destructive"
      onClick={onClick}
      aria-label={label}
    >
      <Unlink className="size-4" />
    </Button>
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

function NotificationUtilizationAnswer({
  notificationId,
}: {
  notificationId: string;
}) {
  return (
    <UtilizationGridList {...useAffectedfAssetUtilization(notificationId)} />
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
  const [rejecting, setRejecting] = useState<RejectTarget | null>(null);
  const [comment, setComment] = useState("");
  const markMatchIncorrect = useMarkMatchIncorrect();

  const sources = notification.sourceLinks.map((link) => link.sourceRecord);
  const marked = [...sources]
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .flatMap((source) =>
      source.tlp
        ? [{ id: source.id, tlp: source.tlp, label: sourceLabel(source) }]
        : [],
    );

  const detailRows: { label: string; content: ReactNode }[] = [
    {
      label: "TLP",
      content:
        marked.length === 0 ? (
          "—"
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {marked.map(({ id, tlp, label }) => (
              <span key={id} className="flex items-center gap-1">
                <TlpBadge tlp={tlp} source={label} />
              </span>
            ))}
          </div>
        ),
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
    try {
      await markMatchIncorrect.mutateAsync({
        targetType: rejecting.targetType,
        targetId: rejecting.id,
        notificationId: notification.id,
        comment: commentToSave,
      });
      toast.success(`${rejecting.label} unlinked from notification`);
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
                          <UnlinkButton
                            label="Unlink this device group"
                            onClick={() =>
                              setRejecting({
                                targetType: "NotificationDeviceGroupMapping",
                                id: m.id,
                                label: deviceGroupMatchingLabel(
                                  m.deviceGroupMatching,
                                ),
                                noun: "product",
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )),
                )}
              </TableBody>
            </Table>
            <div className="mt-6 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                questions about these devices
              </p>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="utilization" className="border-b-0">
                  <AccordionTrigger className="px-3 text-sm rounded-lg bg-secondary hover:no-underline hover:bg-secondary/80">
                    <span className="flex font-bold items-center gap-2.5 text-left">
                      <HeartIcon className="size-4 shrink-0" />
                      When are these devices being used in my hospital?
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pl-[26px] pt-4">
                    <NotificationUtilizationAnswer
                      notificationId={notification.id}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}

      {notification.vulnerabilities.length > 0 && (
        <CollapsibleCard defaultOpen>
          <CollapsibleCardTrigger>Vulnerabilities</CollapsibleCardTrigger>
          <CollapsibleCardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notification.vulnerabilities.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.vulnerability.cveId ? (
                        <a
                          href={nvdUrl(m.vulnerability.cveId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {m.vulnerability.cveId}
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="block max-w-md truncate">
                          {vulnerabilityLabel(m)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={m.vulnerability.severity} />
                    </TableCell>
                    <TableCell className="text-right">
                      <UnlinkButton
                        label="Unlink this vulnerability"
                        onClick={() =>
                          setRejecting({
                            targetType: "NotificationVulnerabilityMapping",
                            id: m.id,
                            label: vulnerabilityLabel(m),
                            noun: "vulnerability",
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
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

      <NotificationActivityTimeline notification={notification} />

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="w-full min-w-0 sm:w-fit sm:min-w-80 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 wrap-anywhere">
              <Unlink className="size-4 text-destructive shrink-0" />
              Unlink {rejecting?.label}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {rejecting &&
              `This ${rejecting.noun} should not have been attached to this notification`}
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
