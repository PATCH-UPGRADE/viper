"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import { QuestionTooltip } from "@/components/ui/question-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deviceGroupMatchingLabel, parseLocation } from "@/lib/markdown";
import { displayName } from "@/lib/markdown/device-group";
import { cn } from "@/lib/utils";
import {
  useAffectedAssetsPage,
  useAnswerAssetVersion,
  useVersionForVendorProduct,
} from "../hooks/use-notifications";
import type {
  AffectedAssetGroupSummary,
  AffectedAssetsSummary,
  NotificationDetailWithRelations,
  ResolvedDeviceGroupAsset,
} from "../types";
import DropdownCell from "./DropdownCell";

const PAGE_SIZE = 10;

export type Bucket = keyof AffectedAssetsSummary;

/**
 * Buckets are keyed by the `IssueStatus` that lands a matching in them; the
 * visible titles are deliberately independent of those keys.
 */
export const BUCKET_META: Record<
  Bucket,
  { title: string; description: string; accent: string }
> = {
  AFFECTED: {
    title: "Needs Attention",
    description: "Assets affected by a vulnerability.",
    accent: "border-l-red-500",
  },
  UNDER_INVESTIGATION: {
    title: "Needs Information",
    description: "Assets under investigation for a vulnerability.",
    accent: "border-l-yellow-500",
  },
  NOT_AFFECTED: {
    title: "Needs Confirmation",
    description: "Assets assessed as not affected.",
    accent: "border-l-green-500",
  },
  NO_ISSUES: {
    title: "Not Yet Triaged",
    description: "Assets with no triage decision yet.",
    accent: "border-l-muted-foreground",
  },
};

/** Bucket order for both surfaces. */
export const BUCKET_ORDER = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "NOT_AFFECTED",
  "NO_ISSUES",
] as const satisfies readonly Bucket[];

/** The first bucket that has any groups — what the outer accordion opens to. */
export function firstNonEmptyBucket(
  affectedAssets: AffectedAssetsSummary,
  buckets: readonly Bucket[] = BUCKET_ORDER,
): Bucket | undefined {
  return buckets.find((b) => affectedAssets[b].length > 0);
}

// ---------------------------------------------------------------------------
// Per (matching, bucket) asset table — fetches page 1, then "Load more"
// ---------------------------------------------------------------------------

/**
 * `full` is the Affected Assets tab (every column); `compact` is the Respond
 * tab's narrow left column — asset, location, and the still-editable version.
 */
export type AssetTableVariant = "full" | "compact";

export function MatchingAssetTable({
  notificationId,
  group,
  bucket,
  variant = "full",
}: {
  notificationId: string;
  group: AffectedAssetGroupSummary;
  bucket: Bucket;
  variant?: AssetTableVariant;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ResolvedDeviceGroupAsset[]>([]);
  const appendedPages = useRef(new Set<number>());

  const matching = group.deviceGroupMatching;
  // TODO: confrim if there are unnecessary api calls where DGM with same vendor/product
  // appears in both AFFECTED and NOT_AFFECTED, or two DGM with same vendor/product both
  // AFFECTED but with different version range. If so, make it more efficient by
  // https://github.com/PATCH-UPGRADE/viper/pull/171#discussion_r3631431484
  const { data: knownVersions } = useVersionForVendorProduct({
    vendorId: matching.vendorId,
    productId: matching.productId ?? "",
  });

  const suggestedVersion = displayName(matching.version);

  const options = useMemo(() => {
    const names = (knownVersions ?? []).map((v) => v.canonicalDisplayName);
    return suggestedVersion && !names.includes(suggestedVersion)
      ? [suggestedVersion, ...names]
      : names;
  }, [knownVersions, suggestedVersion]);

  const answerVersion = useAnswerAssetVersion();

  const { data, isLoading, isFetching, isError, refetch } =
    useAffectedAssetsPage({
      notificationId,
      matchingId: group.deviceGroupMatching.id,
      bucket,
      page,
      pageSize: PAGE_SIZE,
    });

  useEffect(() => {
    if (!data) return;
    if (data.page === 1) {
      setRows(data.items);
      appendedPages.current = new Set([1]);
      return;
    }
    if (!appendedPages.current.has(data.page)) {
      appendedPages.current.add(data.page);
      setRows((prev) => [...prev, ...data.items]);
    }
  }, [data]);

  const isFull = variant === "full";
  // Keep the header, the body, and the loading/error colSpan in step.
  const columnCount = isFull ? 6 : 3;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            {isFull && <TableHead>IP Address</TableHead>}
            <TableHead>Location</TableHead>
            <TableHead className="w-60">Version</TableHead>
            {isFull && <TableHead>Status</TableHead>}
            {isFull && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-mono text-xs">
                <span className="inline-flex items-center gap-1">
                  {asset.hostname ?? asset.id}
                  {asset.statusNotes && (
                    <QuestionTooltip>
                      <span className="whitespace-pre-line">
                        {asset.statusNotes}
                      </span>
                    </QuestionTooltip>
                  )}
                </span>
              </TableCell>
              {isFull && <TableCell>{asset.ip}</TableCell>}
              <TableCell>{parseLocation(asset.location)}</TableCell>
              <TableCell className="w-60">
                <DropdownCell
                  value={asset.version}
                  versionStatus={asset.versionStatus}
                  options={options}
                  onAnswer={(answer) =>
                    answerVersion.mutateAsync({ id: asset.id, ...answer })
                  }
                  isPending={answerVersion.isPending}
                />
              </TableCell>
              {isFull && <TableCell>{asset.status ?? "—"}</TableCell>}
              {isFull && (
                <TableCell>
                  <MoreVerticalDropdownMenu
                    items={[
                      {
                        label: "View asset detail",
                        href: `/assets/${asset.id}`,
                      },
                    ]}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-sm text-muted-foreground"
              >
                Loading assets…
              </TableCell>
            </TableRow>
          )}
          {isError && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-sm text-muted-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  Failed to load assets.
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {(data?.hasNextPage ?? false) && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            {isFetching
              ? "Loading…"
              : `Load more (${rows.length} of ${group.assetCount})`}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bucket accordion — outer item per bucket, inner item per device group
// ---------------------------------------------------------------------------

export function BucketAccordion({
  bucket,
  notificationId,
  groups,
  variant = "full",
  expandGroups = false,
}: {
  bucket: Bucket;
  notificationId: string;
  groups: AffectedAssetGroupSummary[];
  variant?: AssetTableVariant;
  /**
   * Open every device group by default. The narrow Respond column keeps them
   * collapsed (the bucket header is the summary); the full-width tab opens
   * them so the asset tables are visible straight away.
   */
  expandGroups?: boolean;
}) {
  if (groups.length === 0) return null;

  const { title, description, accent } = BUCKET_META[bucket];
  const totalAssets = groups.reduce((sum, g) => sum + g.assetCount, 0);

  return (
    <Card className={cn("border-l-4 py-0 gap-0", accent)}>
      <AccordionItem value={bucket} className="border-b-0 px-4">
        <AccordionTrigger className="items-center">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 text-left">
              <span className="font-semibold">{title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {description}
              </span>
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              <b className="text-foreground">{totalAssets}</b>{" "}
              {totalAssets === 1 ? "asset" : "assets"}
            </span>
          </div>
        </AccordionTrigger>

        <AccordionContent className="pb-4">
          <Accordion
            type="multiple"
            defaultValue={
              expandGroups
                ? groups.map((g) => g.deviceGroupMatching.id)
                : undefined
            }
            className="flex flex-col"
          >
            {groups.map((group) => {
              const matching = group.deviceGroupMatching;
              const notes = Object.entries(group.notesByVuln);
              return (
                <AccordionItem
                  key={`${notificationId}-${bucket}-${matching.id}`}
                  value={matching.id}
                >
                  <AccordionTrigger className="items-center">
                    <div className="flex w-full items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-0.5 text-left">
                        <span className="font-semibold">
                          {deviceGroupMatchingLabel(matching)}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {[
                            displayName(matching.vendor),
                            displayName(matching.product),
                            displayName(matching.version) ??
                              matching.versionRange,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {group.assetCount}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {notes.length > 0 && (
                      <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {notes.map(([vulnId, note]) => (
                          <li key={vulnId}>{note}</li>
                        ))}
                      </ul>
                    )}
                    <MatchingAssetTable
                      notificationId={notificationId}
                      group={group}
                      bucket={bucket}
                      variant={variant}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// "Not in your inventory" summary card
// ---------------------------------------------------------------------------

export function NotInInventoryCard({
  deviceGroupsMatchings,
}: {
  deviceGroupsMatchings: NotificationDetailWithRelations["deviceGroupsMatchings"];
}) {
  const [showMissing, setShowMissing] = useState(false);
  const withoutAssets = deviceGroupsMatchings.filter((m) => m.assetCount === 0);
  const withAssetsCount = deviceGroupsMatchings.length - withoutAssets.length;

  if (withoutAssets.length === 0) return null;

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="text-sm font-normal">
          This advisory applies to <b>{withAssetsCount} of your products</b>.
          The vendor bulletin listed <b>{deviceGroupsMatchings.length}</b>.
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Collapsible open={showMissing} onOpenChange={setShowMissing}>
          <CollapsibleTrigger chevron className="text-sm hover:text-foreground">
            {showMissing ? "Hide" : "Show"} the {withoutAssets.length} products
            not in your inventory
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {withoutAssets.map((mapping) => (
                <li key={mapping.id}>
                  {deviceGroupMatchingLabel(mapping.deviceGroupMatching)}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
