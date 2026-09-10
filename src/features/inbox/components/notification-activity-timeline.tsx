"use client";

import {
  ActivityTimeline,
  actorFromUser,
  type TimelineActor,
  type TimelineEntry,
  VIPER_ACTOR,
} from "@/components/activity-timeline";
import {
  FieldChange,
  type FieldRenderers,
  FieldValueChange,
  priorityFieldRenderer,
} from "@/components/field-change";
import type { NotificationType } from "@/generated/prisma";
import type { NotificationDetailWithRelations } from "../types";
import { NotificationTypeBadge } from "./notification-type-badge";
import {
  type NotificationActivityRow,
  notificationActivityRows,
} from "./shared";

const notificationFieldRenderers: FieldRenderers = {
  priority: priorityFieldRenderer,
  type: {
    label: "Category",
    render: (value) => (
      <NotificationTypeBadge type={value as NotificationType} />
    ),
  },
};

const rowBody = (row: NotificationActivityRow) => {
  switch (row.kind) {
    case "NOTIFICATION_CREATED":
      return (
        <span className="text-foreground">
          Created this notification from {row.sourceLabel}
        </span>
      );
    case "SOURCE_LINKED":
      return (
        <FieldChange
          label="Linked a new source"
          to={
            <span className="font-medium text-foreground">
              {row.sourceLabel}
            </span>
          }
          note={row.reasonWhy}
        />
      );
    case "FIELD_CHANGED":
      return (
        <FieldValueChange
          field={row.field}
          from={row.from}
          to={row.to}
          note={row.reason}
          renderers={notificationFieldRenderers}
        />
      );
  }
};

const rowActor = (row: NotificationActivityRow): TimelineActor =>
  row.kind === "FIELD_CHANGED" ? actorFromUser(row.user) : VIPER_ACTOR;

export const NotificationActivityTimeline = ({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) => {
  const entries: TimelineEntry[] = notificationActivityRows(notification).map(
    (row) => ({
      id: row.id,
      kind: `Activity: ${row.kind}`,
      createdAt: row.createdAt,
      actor: rowActor(row),
      body: rowBody(row),
    }),
  );
  return <ActivityTimeline entries={entries} />;
};
