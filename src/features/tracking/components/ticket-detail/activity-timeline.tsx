"use client";

import { format } from "date-fns";
import { BotIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { priorityConfig } from "@/components/priority-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChipClass } from "@/features/tag-colors/palette";
import type {
  Priority,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import { formatScheduled } from "@/lib/date-utils";
import { initialsOf } from "@/lib/utils";
import type { TicketDetail } from "../../types";
import { AddCommentForm } from "./add-comment-form";
import { CollapsibleSectionCard } from "./section-card";
import { categoryLabels, formatDate, StatusChip } from "./shared";

type Comment = TicketDetail["comments"][number];
type Activity = TicketDetail["activities"][number];

type TimelineEntry =
  | { kind: "activity"; createdAt: Date; row: Activity }
  | { kind: "comment"; createdAt: Date; row: Comment };

const isAgentUser = (user: Activity["user"]) => !!user.integrationUser;

// Automation actors (integration users) surface under one identity rather than
// the specific integration's user name (e.g. "Siemens Healthineers ... Fleet").
const AGENT_DISPLAY_NAME = "VIPER";
const actorName = (user: Activity["user"]) =>
  isAgentUser(user) ? AGENT_DISPLAY_NAME : user.name;

const SetField = ({ label, value }: { label: string; value: string }) => (
  <span>
    <span className="font-medium text-foreground">{label}</span> was set to{" "}
    <span className="font-medium text-foreground">{value}</span>
  </span>
);

const AgentBadge = () => (
  <Badge
    variant="secondary"
    className="px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide"
  >
    AI Agent
  </Badge>
);

const ActorAvatar = ({ user }: { user: Activity["user"] }) =>
  isAgentUser(user) ? (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <BotIcon className="size-4" />
    </span>
  ) : (
    <Avatar className="size-8 shrink-0 border">
      {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
      <AvatarFallback className="bg-accent text-accent-foreground text-xs">
        {initialsOf(user.name)}
      </AvatarFallback>
    </Avatar>
  );

const WorkOrderCreatedBody = ({ activity }: { activity: Activity }) => {
  const data = activity.data as {
    source?: string | null;
    advisoryTitle?: string | null;
    cveId?: string | null;
    externalRecordId?: string | null;
    category?: string | null;
    priority?: string | null;
  };

  const categoryLabel =
    data.category && data.category in categoryLabels
      ? categoryLabels[data.category as TicketCategory]
      : null;
  const priorityLabel =
    data.priority && data.priority in priorityConfig
      ? priorityConfig[data.priority as Priority].label
      : null;

  const generatedParts: string[] = [];
  if (data.advisoryTitle) {
    generatedParts.push(
      `advisory ${data.advisoryTitle}${data.cveId ? ` (${data.cveId})` : ""}`,
    );
  }
  if (data.externalRecordId) {
    generatedParts.push(
      `${data.source ?? "external"} record ${data.externalRecordId}`,
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-foreground">
        Created this work order{data.source ? ` from ${data.source}` : ""}
      </span>
      {generatedParts.length > 0 && (
        <span className="text-xs">
          Generated from {generatedParts.join(" · ")}
        </span>
      )}
      {categoryLabel && <SetField label="Category" value={categoryLabel} />}
      {priorityLabel && <SetField label="Priority" value={priorityLabel} />}
    </div>
  );
};

// biome-ignore lint/suspicious/noExplicitAny: activity.data is a Json blob with type-specific shape
const renderActivity = (a: Activity): React.ReactNode => {
  const data = a.data as any;
  switch (a.type) {
    case "WORK_ORDER_CREATED":
      return <WorkOrderCreatedBody activity={a} />;
    case "STATUS_CHANGED":
      return (
        <>
          changed status from <StatusChip status={data.from as TicketStatus} />{" "}
          to <StatusChip status={data.to as TicketStatus} />
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
        | null
        | undefined;
      const action =
        !data.from && data.to
          ? "added"
          : data.from && !data.to
            ? "removed"
            : "edited";
      // No department → the general/original description.
      if (!dept) return <>{action} the description</>;
      return (
        <>
          {action} the description for{" "}
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

const TimelineConnector = () => (
  <span
    aria-hidden
    className="-bottom-4 -translate-x-1/2 absolute top-8 left-4 w-px bg-border"
  />
);

const ActivityRow = ({
  activity,
  isLast,
}: {
  activity: Activity;
  isLast: boolean;
}) => (
  <li
    className="relative flex items-start gap-3 text-sm"
    aria-label={`Activity: ${activity.type}`}
  >
    {!isLast && <TimelineConnector />}
    <ActorAvatar user={activity.user} />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-semibold">{actorName(activity.user)}</span>
        {isAgentUser(activity.user) && <AgentBadge />}
        <span className="text-xs text-muted-foreground">
          {formatScheduled(activity.createdAt, "·")}
        </span>
      </div>
      <div className="text-muted-foreground">{renderActivity(activity)}</div>
    </div>
  </li>
);

const CommentRow = ({
  comment,
  isLast,
}: {
  comment: Comment;
  isLast: boolean;
}) => (
  <li className="relative flex gap-3" aria-label="Comment">
    {!isLast && <TimelineConnector />}
    <Avatar className="size-8 shrink-0 border">
      {comment.author.image && (
        <AvatarImage
          src={comment.author.image}
          alt={comment.author.name ?? ""}
        />
      )}
      <AvatarFallback className="bg-accent text-accent-foreground text-xs">
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
    // Newest first.
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const [showComment, setShowComment] = useState(false);

  return (
    <CollapsibleSectionCard
      title="Activity"
      meta={`${entries.length} event${entries.length === 1 ? "" : "s"}`}
      action={
        !showComment && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowComment(true)}
          >
            <PlusIcon className="size-3.5" />
            Add comment
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {showComment && (
          <AddCommentForm
            ticketId={ticketId}
            onCancel={() => setShowComment(false)}
            onSubmitted={() => setShowComment(false)}
          />
        )}
        {entries.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {entries.map((entry, i) =>
              entry.kind === "activity" ? (
                <ActivityRow
                  key={`a-${entry.row.id}`}
                  activity={entry.row}
                  isLast={i === entries.length - 1}
                />
              ) : (
                <CommentRow
                  key={`c-${entry.row.id}`}
                  comment={entry.row}
                  isLast={i === entries.length - 1}
                />
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </div>
    </CollapsibleSectionCard>
  );
};
