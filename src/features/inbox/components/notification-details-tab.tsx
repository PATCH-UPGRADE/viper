// TODO(VW-499): Fix changes after VW-427
"use client";

import { format } from "date-fns";
import {
  ActivityIcon,
  ExternalLinkIcon,
  HeartIcon,
  MailIcon,
  Unlink,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DeviceQuestionAccordionItem } from "@/components/device-question-accordion-item";
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
import { DeviceGuideList } from "@/features/device-types/components/device-guide-list";
import {
  describeProducts,
  type PageProduct,
} from "@/features/device-types/device-guides";
import { CVE_PATTERN } from "@/features/vulnerabilities/utils";
import type { MatchFeedbackTargetType } from "@/generated/prisma";
import { deviceGroupMatchingLabel, matchingVersionLabel } from "@/lib/markdown";
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

type RejectTarget = {
  targetType: MatchFeedbackTargetType;
  id: string;
  label: string;
  noun: "product" | "vulnerability";
};

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

  const productsById = new Map<string, PageProduct>();
  for (const m of withAssets) {
    const product = m.deviceGroupMatching.product;
    if (!product) continue;
    const existing = productsById.get(product.id);
    if (existing) {
      existing.assetCount += m.assetCount;
    } else {
      productsById.set(product.id, {
        productId: product.id,
        product: product.canonicalDisplayName,
        deviceTypeId: product.deviceTypeId,
        assetCount: m.assetCount,
      });
    }
  }
  const affectedProducts: PageProduct[] = [...productsById.values()];

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
                            {matchingVersionLabel(m.deviceGroupMatching)}
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
                {affectedProducts.length > 0 && (
                  <DeviceQuestionAccordionItem
                    value="typical-usage"
                    icon={ActivityIcon}
                    title="How are these devices typically used in hospitals?"
                    {...describeProducts(affectedProducts)}
                  >
                    <DeviceGuideList products={affectedProducts} />
                  </DeviceQuestionAccordionItem>
                )}
                <AccordionItem
                  value="utilization"
                  className="overflow-hidden rounded-xl border last:border-b"
                >
                  <AccordionTrigger className="items center rounded-none bg-secondary hover:bg-secondary/80 px-4 py-3 hover:no-underline dark:bg-background/20">
                    <span className="flex font-bold items-center gap-2.5 text-left">
                      <HeartIcon className="size-4 shrink-0" />
                      When are these devices being used in my hospital?
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="bg-card px-6 pt-5 pb-5 dark:bg-accent/40">
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
                      {CVE_PATTERN.test(m.vulnerability.displayId) ? (
                        <a
                          href={nvdUrl(m.vulnerability.displayId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {m.vulnerability.displayId}
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="block max-w-md truncate">
                          {m.vulnerability.displayId}
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
                            label: m.vulnerability.displayId,
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
