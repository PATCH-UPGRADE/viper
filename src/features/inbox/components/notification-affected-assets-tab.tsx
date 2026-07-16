"use client";

import { useEffect, useRef, useState } from "react";
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
import { useAffectedAssetsPage } from "../hooks/use-notifications";
import type {
  AffectedAssetGroupSummary,
  AffectedAssetsSummary,
  NotificationDetailWithRelations,
  ResolvedDeviceGroupAsset,
} from "../types";

const PAGE_SIZE = 10;

type Bucket = keyof AffectedAssetsSummary;

// ---------------------------------------------------------------------------
// Per (matching, bucket) asset table — fetches page 1, then "Load more"
// ---------------------------------------------------------------------------

function MatchingAssetTable({
  notificationId,
  group,
  bucket,
}: {
  notificationId: string;
  group: AffectedAssetGroupSummary;
  bucket: Bucket;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ResolvedDeviceGroupAsset[]>([]);
  const appendedPages = useRef(new Set<number>());

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {deviceGroupMatchingLabel(group.deviceGroupMatching)}
          <Badge variant="secondary" className="font-normal">
            {group.assetCount}
          </Badge>
        </CardTitle>
        {Object.keys(group.notesByVuln).length > 0 && (
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground list-disc pl-5">
            {Object.entries(group.notesByVuln).map(([vulnId, note]) => (
              <li key={vulnId}>{note}</li>
            ))}
          </ul>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset ID</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
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
                <TableCell>{asset.ip}</TableCell>
                <TableCell>{parseLocation(asset.location)}</TableCell>
                <TableCell>{asset.version ?? "—"}</TableCell>
                <TableCell>{asset.status ?? "—"}</TableCell>
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
              </TableRow>
            ))}
            {isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground"
                >
                  Loading assets…
                </TableCell>
              </TableRow>
            )}
            {isError && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    Failed to load assets.
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                    >
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
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section (a triage bucket) — heading + one table per matching
// ---------------------------------------------------------------------------

function BucketSection({
  title,
  description,
  notificationId,
  bucket,
  groups,
}: {
  title: string;
  description: string;
  notificationId: string;
  bucket: Bucket;
  groups: AffectedAssetGroupSummary[];
}) {
  if (groups.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {groups.map((group) => (
        <MatchingAssetTable
          key={`${notificationId}-${bucket}-${group.deviceGroupMatching.id}`}
          notificationId={notificationId}
          group={group}
          bucket={bucket}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function NotificationAffectedAssetsTab({
  notificationId,
  affectedAssets,
  deviceGroupsMatchings,
}: {
  notificationId: string;
  affectedAssets: AffectedAssetsSummary;
  deviceGroupsMatchings: NotificationDetailWithRelations["deviceGroupsMatchings"];
}) {
  const [showMissing, setShowMissing] = useState(false);

  const { needsAttention, needsInformation, lowConcern, unaffected } =
    affectedAssets;
  const withoutAssets = deviceGroupsMatchings.filter((m) => m.assetCount === 0);
  const withAssetsCount = deviceGroupsMatchings.length - withoutAssets.length;

  const hasAnyGroup =
    needsAttention.length > 0 ||
    needsInformation.length > 0 ||
    lowConcern.length > 0 ||
    unaffected.length > 0;

  if (!hasAnyGroup && withoutAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No device groups with matching assets found.
      </p>
    );
  }

  return (
    <>
      <BucketSection
        title="Needs Attention"
        description="Assets affected by a vulnerability."
        notificationId={notificationId}
        bucket="needsAttention"
        groups={needsAttention}
      />
      <BucketSection
        title="Needs Information"
        description="Assets under investigation for a vulnerability."
        notificationId={notificationId}
        bucket="needsInformation"
        groups={needsInformation}
      />
      <BucketSection
        title="Low Concern"
        description="Assets assessed as not affected."
        notificationId={notificationId}
        bucket="lowConcern"
        groups={lowConcern}
      />

      {unaffected.map((group) => (
        <MatchingAssetTable
          key={`${notificationId}-unaffected-${group.deviceGroupMatching.id}`}
          notificationId={notificationId}
          group={group}
          bucket="unaffected"
        />
      ))}

      {withoutAssets.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              This advisory applies to <b>{withAssetsCount} of your products</b>
              . The vendor bulletin listed <b>{deviceGroupsMatchings.length}</b>
              .
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Collapsible open={showMissing} onOpenChange={setShowMissing}>
              <CollapsibleTrigger
                chevron
                className="text-sm hover:text-foreground"
              >
                {showMissing ? "Hide" : "Show"} the {withoutAssets.length}{" "}
                products not in your inventory
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ol className="mt-2 space-y-1 pl-5 text-sm text-muted-foreground list-decimal">
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
      )}
    </>
  );
}
