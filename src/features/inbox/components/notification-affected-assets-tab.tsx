"use client";

import { Accordion } from "@/components/ui/accordion";
import type {
  AffectedAssetsSummary,
  NotificationDetailWithRelations,
} from "../types";
import {
  BUCKET_ORDER,
  type Bucket,
  BucketAccordion,
  NotInInventoryCard,
} from "./affected-assets-accordion";

// The three triage buckets open fully on this tab — buckets and their device
// groups — so every asset table is visible without clicking. NO_ISSUES holds
// untriaged noise and stays collapsed.
const EXPANDED_BUCKETS: Bucket[] = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "NOT_AFFECTED",
];

export function NotificationAffectedAssetsTab({
  notificationId,
  affectedAssets,
  deviceGroupsMatchings,
}: {
  notificationId: string;
  affectedAssets: AffectedAssetsSummary;
  deviceGroupsMatchings: NotificationDetailWithRelations["deviceGroupsMatchings"];
}) {
  const withoutAssets = deviceGroupsMatchings.filter((m) => m.assetCount === 0);
  const hasAnyGroup = BUCKET_ORDER.some((b) => affectedAssets[b].length > 0);

  if (!hasAnyGroup && withoutAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No device groups with matching assets found.
      </p>
    );
  }

  return (
    <>
      <Accordion
        type="multiple"
        defaultValue={EXPANDED_BUCKETS}
        className="flex flex-col gap-4"
      >
        {BUCKET_ORDER.map((bucket) => (
          <BucketAccordion
            key={bucket}
            bucket={bucket}
            notificationId={notificationId}
            groups={affectedAssets[bucket]}
            variant="full"
            expandGroups={EXPANDED_BUCKETS.includes(bucket)}
          />
        ))}
      </Accordion>

      <NotInInventoryCard deviceGroupsMatchings={deviceGroupsMatchings} />
    </>
  );
}
