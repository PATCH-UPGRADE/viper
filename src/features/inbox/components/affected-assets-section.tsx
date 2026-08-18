"use client";

import { Accordion } from "@/components/ui/accordion";
import type { NotificationDetailWithRelations } from "../types";
import {
  type Bucket,
  BucketAccordion,
  firstNonEmptyBucket,
  NotInInventoryCard,
} from "./affected-assets-accordion";

const RESPOND_BUCKETS = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "NOT_AFFECTED",
] as const satisfies readonly Bucket[];

export function AffectedAssetsSection({
  notification,
  className,
}: {
  notification: NotificationDetailWithRelations;
  className?: string;
}) {
  const { affectedAssets, deviceGroupsMatchings } = notification;
  const hasAnyGroup = RESPOND_BUCKETS.some((b) => affectedAssets[b].length > 0);

  return (
    <section className={className}>
      <div className="flex flex-col gap-3 sticky top-0">
        <h3 className="font-semibold uppercase tracking-wide text-sm">
          What&apos;s affected
        </h3>

        {hasAnyGroup ? (
          <Accordion
            type="single"
            collapsible
            defaultValue={firstNonEmptyBucket(affectedAssets, RESPOND_BUCKETS)}
            className="flex flex-col gap-3"
          >
            {RESPOND_BUCKETS.map((bucket) => (
              <BucketAccordion
                key={bucket}
                bucket={bucket}
                notificationId={notification.id}
                groups={affectedAssets[bucket]}
                variant="compact"
              />
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">
            No triaged assets for this notification.
          </p>
        )}

        <NotInInventoryCard deviceGroupsMatchings={deviceGroupsMatchings} />
      </div>
    </section>
  );
}
