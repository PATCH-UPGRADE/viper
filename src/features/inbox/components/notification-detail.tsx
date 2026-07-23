"use client";

import { formatDistanceToNow } from "date-fns";
import { Suspense, useEffect, useState } from "react";
import { BadgeSelect } from "@/components/badge-select";
import { CorrectionDialog } from "@/components/correction-dialog";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { PriorityBadge } from "@/components/priority-badge";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NotificationType, Priority } from "@/generated/prisma";
import { useSuspenseMitigationPlans } from "@/features/mitigation/hooks/use-mitigation";
import {
  useMarkNotificationRead,
  useSuspenseNotification,
  useUpdateNotification,
} from "../hooks/use-notifications";
import type { NotificationDetailSource } from "../types";
import { NotificationAffectedAssetsTab } from "./notification-affected-assets-tab";
import { NotificationDetailsTab } from "./notification-details-tab";
import { NotificationRespondTab } from "./notification-respond-tab";
import { NotificationTypeBadge } from "./notification-type-badge";

const NOTIFICATION_TYPE_OPTIONS: NotificationType[] = [
  "Advisory",
  "Recall",
  "UpdateAvailable",
  "Other",
];

const PRIORITY_OPTIONS: Priority[] = [
  "Critical",
  "High",
  "Defer",
  "Monitor",
  "Unsorted",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSourceChannel(source: NotificationDetailSource): string {
  switch (source.channel) {
    case "Email":
      return "email";
    case "PolledApi":
      return "polled api";
    case "Crawl":
      return "crawl";
  }
}

// ---------------------------------------------------------------------------
// Loading / Error exports
// ---------------------------------------------------------------------------

export const NotificationDetailLoading = () => (
  <LoadingView message="Loading notification..." />
);

export const NotificationDetailError = () => (
  <ErrorView message="Error loading notification" />
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const NotificationDetailPage = ({ id }: { id: string }) => {
  const { data: notification } = useSuspenseNotification(id);
  const { data: plans } = useSuspenseMitigationPlans(id);
  const markRead = useMarkNotificationRead();
  const updateNotification = useUpdateNotification();
  const [pendingType, setPendingType] = useState<NotificationType | null>(null);
  const [pendingPriority, setPendingPriority] = useState<Priority | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on id change; markRead.mutate is stable
  useEffect(() => {
    if (notification.reads.length === 0) {
      markRead.mutate({ notificationId: id });
    }
  }, [id]);

  const handleOnSaveTypeCorrection = async (reason: string | undefined) => {
    if (!pendingType) return;
    await updateNotification.mutateAsync({
      id: notification.id,
      type: pendingType,
      reason,
    });
    setPendingType(null);
  };

  const handleOnSavePriorityCorrection = async (reason: string | undefined) => {
    if (!pendingPriority) return;
    await updateNotification.mutateAsync({
      id: notification.id,
      priority: pendingPriority,
      reason,
    });
    setPendingPriority(null);
  };

  const displayTitle =
    notification.title ?? notification.summary ?? notification.id;

  const hasPlans = plans.length > 0;

  // Assets in the "Needs Attention" (AFFECTED) triage bucket — surfaced as a
  // badge on the Affected Assets tab.
  const needAttentionCount = notification.affectedAssets.AFFECTED.reduce(
    (sum, group) => sum + group.assetCount,
    0,
  );

  const firstReceived =
    notification.sources.length > 0
      ? new Date(
          Math.min(
            ...notification.sources.map((s) =>
              new Date(s.receivedAt).getTime(),
            ),
          ),
        )
      : notification.createdAt;

  return (
    <div className="flex flex-col gap-6 p-8 w-full max-w-7xl">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/inbox">All Notifications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-sm truncate">
              {displayTitle}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Badge select */}
      <div className="flex items-center gap-2">
        <BadgeSelect
          value={notification.type}
          options={NOTIFICATION_TYPE_OPTIONS}
          groupLabel={"SET CATEGORY"}
          renderBadge={(nType) => <NotificationTypeBadge type={nType} />}
          onPendingChanges={setPendingType}
        />
        {notification.priorityReasonWhy ? (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <BadgeSelect
                value={notification.priority}
                options={PRIORITY_OPTIONS}
                groupLabel="SET PRIORITY"
                renderBadge={(p) => <PriorityBadge priority={p} />}
                onPendingChanges={setPendingPriority}
              />
            </HoverCardTrigger>
            <HoverCardContent className="w-72 text-sm">
              {notification.priorityReasonWhy}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <BadgeSelect
            value={notification.priority}
            options={PRIORITY_OPTIONS}
            groupLabel="SET PRIORITY"
            renderBadge={(p) => <PriorityBadge priority={p} />}
            onPendingChanges={setPendingPriority}
          />
        )}
      </div>

      <CorrectionDialog
        open={pendingType !== null}
        title="Change Category"
        question="Why are you changing the category?"
        fromContent={<NotificationTypeBadge type={notification.type} />}
        toContent={
          pendingType ? <NotificationTypeBadge type={pendingType} /> : null
        }
        onCancel={() => setPendingType(null)}
        onSave={handleOnSaveTypeCorrection}
      />

      <CorrectionDialog
        open={pendingPriority !== null}
        title="Change Priority"
        question="Why are you changing this priority?"
        fromContent={<PriorityBadge priority={notification.priority} />}
        toContent={
          pendingPriority ? <PriorityBadge priority={pendingPriority} /> : null
        }
        onCancel={() => setPendingPriority(null)}
        onSave={handleOnSavePriorityCorrection}
      />

      {/* Title */}
      <h1 className="text-3xl font-semibold tracking-tight">{displayTitle}</h1>

      {/* Meta line */}
      <p className="text-sm text-muted-foreground -mt-3">
        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
        {notification.sources.length > 0 && (
          <>
            {" · "}
            {notification.sources.length} source
            {notification.sources.length !== 1 ? "s" : ""} (
            {[...new Set(notification.sources.map(formatSourceChannel))].join(
              ", ",
            )}
            )
          </>
        )}
      </p>

      {/* Tabs */}
      <Tabs defaultValue={hasPlans ? "respond" : "details"}>
        {/* Sticky, full-width bordered bar; the list stays w-fit so the tabs
            hug the left instead of stretching across the row. */}
        <div className="sticky top-0 z-20 -mx-8 border-b bg-muted px-8">
          <TabsList variant="line-primary">
            {hasPlans && <TabsTrigger value="respond">Respond</TabsTrigger>}
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="affected-assets">
              Affected Assets
              {needAttentionCount > 0 && (
                <Badge variant="destructive">
                  {needAttentionCount} need{needAttentionCount === 1 ? "s" : ""}{" "}
                  attention
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {hasPlans && (
          <TabsContent value="respond" className="flex flex-col gap-4 mt-4">
            <Suspense
              fallback={<LoadingView message="Loading response plans..." />}
            >
              <NotificationRespondTab notification={notification} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="details" className="flex flex-col gap-4 mt-4">
          <NotificationDetailsTab
            notification={notification}
            firstReceived={firstReceived}
          />
        </TabsContent>

        <TabsContent
          value="affected-assets"
          className="flex flex-col gap-4 mt-4"
        >
          <NotificationAffectedAssetsTab
            notificationId={notification.id}
            affectedAssets={notification.affectedAssets}
            deviceGroupsMatchings={notification.deviceGroupsMatchings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
