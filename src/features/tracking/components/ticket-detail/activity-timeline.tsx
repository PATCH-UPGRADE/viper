"use client";

import { format } from "date-fns";
import {
  ActivityTimeline,
  actorFromUser,
  type TimelineEntry,
} from "@/components/activity-timeline";
import {
  type FieldRenderers,
  FieldValueChange,
  priorityFieldRenderer,
} from "@/components/field-change";
import { priorityConfig } from "@/components/priority-badge";
import { SeenBy } from "@/components/seen-by";
import { Badge } from "@/components/ui/badge";
import { getChipClass } from "@/features/tag-colors/palette";
import type {
  Priority,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import { useTicketSeenBy } from "../../hooks/use-tracking";
import type { TicketDetail } from "../../types";
import { AddCommentForm } from "./add-comment-form";
import { categoryLabels, StatusChip } from "./shared";

type Comment = TicketDetail["comments"][number];
type Activity = TicketDetail["activities"][number];

const SetField = ({ label, value }: { label: string; value: string }) => (
  <span>
    <span className="font-medium text-foreground">{label}</span> was set to{" "}
    <span className="font-medium text-foreground">{value}</span>
  </span>
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

const ticketFieldRenderers: FieldRenderers = {
  status: {
    label: "Status",
    render: (value) => <StatusChip status={value as TicketStatus} />,
  },
  category: {
    label: "Category",
    render: (value) => (
      <Badge variant="outline">{categoryLabels[value as TicketCategory]}</Badge>
    ),
  },
  priority: priorityFieldRenderer,
};

const renderActivity = (a: Activity): React.ReactNode => {
  // biome-ignore lint/suspicious/noExplicitAny: activity.data is a Json blob with type-specific shape
  const data = a.data as any;
  switch (a.type) {
    case "WORK_ORDER_CREATED":
      return <WorkOrderCreatedBody activity={a} />;
    case "STATUS_CHANGED":
      return (
        <FieldValueChange
          field="status"
          from={data.from}
          to={data.to}
          renderers={ticketFieldRenderers}
        />
      );
    case "CATEGORY_CHANGED":
      return (
        <FieldValueChange
          field="category"
          from={data.from}
          to={data.to}
          renderers={ticketFieldRenderers}
        />
      );
    case "PRIORITY_CHANGED":
      return (
        <FieldValueChange
          field="priority"
          from={data.from}
          to={data.to}
          renderers={ticketFieldRenderers}
        />
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
      return "changed assignee";
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
      if (from && !to) return "cleared the scheduled time";
      if (from && to)
        return (
          <>
            rescheduled from {format(from, "MMM d")} to{" "}
            {format(to, "MMM d, yyyy 'at' h:mm a")}
          </>
        );
      return "changed the scheduled time";
    }
    case "SUMMARY_CHANGED":
      return "edited the summary";
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

const CommentBody = ({ comment }: { comment: Comment }) => (
  <div className="flex flex-col gap-1">
    {comment.author.department && (
      <Badge
        variant="outline"
        className={`w-fit ${getChipClass(comment.author.department.color)}`}
      >
        {comment.author.department.name}
      </Badge>
    )}
    <p className="whitespace-pre-wrap text-foreground">{comment.body}</p>
  </div>
);

const activityEntry = (activity: Activity): TimelineEntry => ({
  id: `a-${activity.id}`,
  kind: `Activity: ${activity.type}`,
  createdAt: new Date(activity.createdAt),
  actor: actorFromUser(activity.user),
  body: renderActivity(activity),
});

const commentEntry = (comment: Comment): TimelineEntry => ({
  id: `c-${comment.id}`,
  kind: "Comment",
  createdAt: new Date(comment.createdAt),
  actor: actorFromUser(comment.author),
  body: <CommentBody comment={comment} />,
});

export const TicketActivityTimeline = ({
  ticketId,
  comments,
  activities,
}: {
  ticketId: string;
  comments: Comment[];
  activities: Activity[];
}) => {
  const { data: viewers = [] } = useTicketSeenBy(ticketId);
  const entries = [
    ...activities.map(activityEntry),
    ...comments.map(commentEntry),
  ];

  return (
    <ActivityTimeline
      entries={entries}
      composer={<AddCommentForm ticketId={ticketId} />}
      footer={<SeenBy viewers={viewers} />}
    />
  );
};
