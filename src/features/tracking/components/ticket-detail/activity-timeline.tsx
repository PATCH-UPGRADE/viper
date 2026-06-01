"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRightIcon,
  BoxIcon,
  BuildingIcon,
  CalendarIcon,
  GitBranchIcon,
  HistoryIcon,
  MessageSquareIcon,
  PencilIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { TicketDetail } from "../../types";
import { AddCommentForm } from "./add-comment-form";
import {
  categoryLabels,
  formatDate,
  Section,
  statusHue,
  statusLabels,
} from "./shared";

type Comment = TicketDetail["comments"][number];
type Activity = TicketDetail["activities"][number];

type TimelineEntry =
  | { kind: "activity"; createdAt: Date; row: Activity }
  | { kind: "comment"; createdAt: Date; row: Comment };

const initialsOf = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const relativeTime = (date: Date | string) =>
  formatDistanceToNow(date instanceof Date ? date : new Date(date), {
    addSuffix: true,
  });

const absoluteTime = (date: Date | string) =>
  format(
    date instanceof Date ? date : new Date(date),
    "MMM d, yyyy 'at' h:mm a",
  );

const activityIcon = (type: Activity["type"]) => {
  switch (type) {
    case "STATUS_CHANGED":
    case "CATEGORY_CHANGED":
      return TagIcon;
    case "ASSIGNEE_CHANGED":
      return UserIcon;
    case "DEPARTMENTS_CHANGED":
      return BuildingIcon;
    case "SCHEDULED_AT_CHANGED":
      return CalendarIcon;
    case "SUMMARY_CHANGED":
    case "DESCRIPTION_CHANGED":
      return PencilIcon;
    case "CHILD_ATTACHED":
    case "CHILD_DETACHED":
      return GitBranchIcon;
    case "ASSET_ATTACHED":
    case "ASSET_DETACHED":
      return BoxIcon;
  }
};

// biome-ignore lint/suspicious/noExplicitAny: activity.data is a Json blob with type-specific shape
const renderActivityTagline = (a: Activity): React.ReactNode => {
  const data = a.data as any;
  switch (a.type) {
    case "STATUS_CHANGED":
      return (
        <>
          changed status from{" "}
          <Badge
            variant="outline"
            className={getChipClass(statusHue[data.from as TicketStatus])}
          >
            {statusLabels[data.from as TicketStatus]}
          </Badge>{" "}
          to{" "}
          <Badge
            variant="outline"
            className={getChipClass(statusHue[data.to as TicketStatus])}
          >
            {statusLabels[data.to as TicketStatus]}
          </Badge>
        </>
      );
    case "CATEGORY_CHANGED":
      return (
        <>
          changed category from{" "}
          <Badge variant="outline">
            {categoryLabels[data.from as TicketCategory]}
          </Badge>{" "}
          to{" "}
          <Badge variant="outline">
            {categoryLabels[data.to as TicketCategory]}
          </Badge>
        </>
      );
    case "ASSIGNEE_CHANGED": {
      const from = data.from as { name: string } | null;
      const to = data.to as { name: string } | null;
      if (!from && to) return <>assigned {to.name}</>;
      if (from && !to) return <>unassigned {from.name}</>;
      if (from && to)
        return (
          <>
            reassigned from {from.name} to {to.name}
          </>
        );
      return <>changed assignee</>;
    }
    case "DEPARTMENTS_CHANGED": {
      const added = (data.added ?? []) as Array<{
        id: string;
        name: string;
        color: string | null;
      }>;
      const removed = (data.removed ?? []) as Array<{
        id: string;
        name: string;
        color: string | null;
      }>;
      return (
        <>
          {added.length > 0 && (
            <>
              added{" "}
              {added.map((d, i) => (
                <span key={d.id}>
                  <Badge variant="outline" className={getChipClass(d.color)}>
                    {d.name}
                  </Badge>
                  {i < added.length - 1 ? " " : ""}
                </span>
              ))}
            </>
          )}
          {added.length > 0 && removed.length > 0 && " · "}
          {removed.length > 0 && (
            <>
              removed{" "}
              {removed.map((d, i) => (
                <span key={d.id}>
                  <Badge variant="outline" className={getChipClass(d.color)}>
                    {d.name}
                  </Badge>
                  {i < removed.length - 1 ? " " : ""}
                </span>
              ))}
            </>
          )}
        </>
      );
    }
    case "SCHEDULED_AT_CHANGED": {
      const from = data.from ? new Date(data.from) : null;
      const to = data.to ? new Date(data.to) : null;
      if (!from && to)
        return <>scheduled for {format(to, "MMM d, yyyy 'at' h:mm a")}</>;
      if (from && !to) return <>cleared the scheduled time</>;
      if (from && to)
        return (
          <>
            rescheduled from {format(from, "MMM d")} to{" "}
            {format(to, "MMM d, yyyy 'at' h:mm a")}
          </>
        );
      return <>changed the scheduled time</>;
    }
    case "SUMMARY_CHANGED":
      return <>edited the summary</>;
    case "DESCRIPTION_CHANGED": {
      const dept = data.department as
        | { id: string; name: string; color: string | null }
        | undefined;
      const verb =
        !data.from && data.to
          ? "added a description for"
          : data.from && !data.to
            ? "removed the description for"
            : "edited the description for";
      if (!dept) return <>{verb} a department</>;
      return (
        <>
          {verb}{" "}
          <Badge variant="outline" className={getChipClass(dept.color)}>
            {dept.name}
          </Badge>
        </>
      );
    }
    case "CHILD_ATTACHED":
      return (
        <>
          attached sub-ticket{" "}
          <span className="font-medium">
            {(data.childSummary as string) ?? data.childId}
          </span>
        </>
      );
    case "CHILD_DETACHED":
      return (
        <>
          detached sub-ticket{" "}
          <span className="font-medium">
            {(data.childSummary as string) ?? data.childId}
          </span>
        </>
      );
    case "ASSET_ATTACHED":
      return (
        <>
          attached asset{" "}
          <span className="font-medium font-mono text-xs">
            {(data.assetLabel as string) ?? data.assetId}
          </span>
        </>
      );
    case "ASSET_DETACHED":
      return (
        <>
          detached asset{" "}
          <span className="font-medium font-mono text-xs">
            {(data.assetLabel as string) ?? data.assetId}
          </span>
        </>
      );
  }
};

const ActivityRow = ({ activity }: { activity: Activity }) => {
  const Icon = activityIcon(activity.type);
  return (
    <li
      className="flex items-start gap-3 text-sm"
      aria-label={`Activity: ${activity.type}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-col min-w-0 flex-1 pt-1.5 gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5 text-foreground">
          <span className="font-semibold">{activity.user.name}</span>
          <span className="text-muted-foreground">
            {renderActivityTagline(activity)}
          </span>
        </div>
        <span
          className="text-xs text-muted-foreground"
          title={absoluteTime(activity.createdAt)}
        >
          {relativeTime(activity.createdAt)}
        </span>
      </div>
    </li>
  );
};

const CommentRow = ({ comment }: { comment: Comment }) => (
  <li className="flex gap-3" aria-label="Comment">
    <Avatar className="size-8 shrink-0">
      {comment.author.image && (
        <AvatarImage
          src={comment.author.image}
          alt={comment.author.name ?? ""}
        />
      )}
      <AvatarFallback className="text-xs">
        {initialsOf(comment.author.name)}
      </AvatarFallback>
    </Avatar>
    <div className="flex flex-col min-w-0 flex-1">
      <div className="flex items-center text-xs text-muted-foreground mb-1 gap-2">
        <span className="font-bold text-foreground truncate">
          {comment.author.name}
        </span>
        {comment.author.department && (
          <Badge
            variant="outline"
            className={getChipClass(comment.author.department.color)}
          >
            {comment.author.department.name}
          </Badge>
        )}
        <span>{formatDate(comment.createdAt)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
    </div>
  </li>
);

export const ActivityTimeline = ({
  ticketId,
  comments,
  activities,
}: {
  ticketId: string;
  comments: Comment[];
  activities: Activity[];
}) => {
  const entries: TimelineEntry[] = [
    ...activities.map((row) => ({
      kind: "activity" as const,
      createdAt: new Date(row.createdAt),
      row,
    })),
    ...comments.map((row) => ({
      kind: "comment" as const,
      createdAt: new Date(row.createdAt),
      row,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="rounded-lg border bg-background p-4">
      <Section
        title={
          <span className="flex items-center gap-1.5">
            <HistoryIcon className="size-3.5" /> Activity
            <span className="text-muted-foreground font-normal">
              <MessageSquareIcon className="inline size-3" aria-hidden="true" />{" "}
              {comments.length}{" "}
              <ArrowRightIcon
                className="inline size-3 mx-0.5"
                aria-hidden="true"
              />{" "}
              {activities.length} change{activities.length === 1 ? "" : "s"}
            </span>
          </span>
        }
      >
        {entries.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {entries.map((entry) =>
              entry.kind === "activity" ? (
                <ActivityRow key={`a-${entry.row.id}`} activity={entry.row} />
              ) : (
                <CommentRow key={`c-${entry.row.id}`} comment={entry.row} />
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
        <AddCommentForm ticketId={ticketId} />
      </Section>
    </div>
  );
};
