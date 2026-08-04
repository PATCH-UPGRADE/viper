"use client";

import { formatDistanceToNow } from "date-fns";
import { InboxIcon } from "lucide-react";
import { PriorityBadge } from "@/components/priority-badge";
import { NotificationTypeBadge } from "@/features/inbox/components/notification-type-badge";
import { useSuspenseSuggestedNotifications } from "../hooks/use-overview";
import {
  OverviewCard,
  OverviewCardEmpty,
  OverviewCardMeta,
  OverviewCardRow,
} from "./overview-card";

export const SuggestedInboxCard = () => {
  const { data } = useSuspenseSuggestedNotifications();

  return (
    <OverviewCard
      icon={InboxIcon}
      title="Suggested Inbox Items"
      description="Unread inbox items, highest priority first"
      action={{ label: "Open Inbox", href: "/inbox" }}
    >
      {data.length === 0 && (
        <OverviewCardEmpty message="No unread inbox items." />
      )}
      {data.map((notification) => (
        <OverviewCardRow
          key={notification.id}
          href={`/inbox/${notification.id}`}
        >
          <div className="flex items-center gap-2">
            <span
              role="img"
              aria-label="Unread"
              className="size-2 shrink-0 rounded-full bg-red-500"
            />
            <PriorityBadge priority={notification.priority} />
            <NotificationTypeBadge type={notification.type} />
          </div>
          <p className="text-sm font-semibold">
            {notification.title ?? notification.summary ?? "—"}
          </p>
          <OverviewCardMeta
            className="font-medium text-foreground/80"
            parts={[
              `${notification.assetCount} ${notification.assetCount === 1 ? "asset" : "assets"}`,
            ]}
          />
          <OverviewCardMeta
            parts={[
              formatDistanceToNow(notification.createdAt, { addSuffix: true }),
              `Updated ${formatDistanceToNow(notification.updatedAt, { addSuffix: true })}`,
            ]}
          />
        </OverviewCardRow>
      ))}
    </OverviewCard>
  );
};
