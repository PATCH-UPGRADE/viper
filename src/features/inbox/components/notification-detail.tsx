"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { PriorityBadge } from "@/components/priority-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  useMarkNotificationRead,
  useSuspenseNotification,
} from "../hooks/use-notifications";
import type { NotificationDetailSource } from "../types";
import { NotificationAffectedAssetsTab } from "./notification-affected-assets-tab";
import { NotificationOverviewTab } from "./notification-overview-tab";
import { NotificationTypeBadge } from "./notification-type-badge";

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
  const markRead = useMarkNotificationRead();

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on id change; markRead.mutate is stable
  useEffect(() => {
    if (notification.reads.length === 0) {
      markRead.mutate({ notificationId: id });
    }
  }, [id]);

  const displayTitle =
    notification.title ?? notification.summary ?? notification.id;

  const totalDeviceGroups = notification.deviceGroups.length;
  const deviceGroupsWithAssets = notification.deviceGroups.filter(
    (m) => m.deviceGroup._count.assets > 0,
  ).length;

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
    <div className="flex flex-col gap-6 p-8 w-full max-w-5xl">
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

      {/* Badge row */}
      <div className="flex items-center gap-2">
        <NotificationTypeBadge type={notification.type} />
        {notification.priorityReasonWhy ? (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <PriorityBadge priority={notification.priority} />
            </HoverCardTrigger>
            <HoverCardContent className="w-72 text-sm">
              {notification.priorityReasonWhy}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <PriorityBadge priority={notification.priority} />
        )}
      </div>

      {/* Title */}
      <h1 className="text-3xl font-semibold tracking-tight">
        {notification.title}
      </h1>

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

      {/* Device group coverage alert */}
      {totalDeviceGroups > deviceGroupsWithAssets && (
        <Alert>
          <AlertDescription>
            <b>
              This advisory applies to {deviceGroupsWithAssets} device groups.
            </b>{" "}
            The original notification listed {totalDeviceGroups} device groups.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="affected-assets">Affected Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          <NotificationOverviewTab
            notification={notification}
            firstReceived={firstReceived}
          />
        </TabsContent>

        <TabsContent
          value="affected-assets"
          className="flex flex-col gap-4 mt-4"
        >
          <NotificationAffectedAssetsTab
            deviceGroups={notification.deviceGroups}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
