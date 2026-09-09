"use client";

import { BotIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AUTOMATION_USER_ID } from "@/config/constants";
import { formatScheduled } from "@/lib/date-utils";
import { initialsOf } from "@/lib/string-utils";

export type TimelineActor = {
  name: string | null;
  image?: string | null;
  isAgent: boolean;
};

export type TimelineEntry = {
  id: string;
  kind: string;
  createdAt: Date;
  actor: TimelineActor;
  body: ReactNode;
};

const AGENT_DISPLAY_NAME = "VIPER";

export const isAutomationActor = (user: {
  id: string;
  integrationUser?: { id: string } | null;
}) => user.id === AUTOMATION_USER_ID || !!user.integrationUser;

const AgentBadge = () => (
  <Badge
    variant="secondary"
    className="px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide"
  >
    AI Agent
  </Badge>
);

const ActorAvatar = ({ actor }: { actor: TimelineActor }) =>
  actor.isAgent ? (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <BotIcon className="size-4" />
    </span>
  ) : (
    <Avatar className="size-8 shrink-0 border">
      {actor.image && <AvatarImage src={actor.image} alt={actor.name ?? ""} />}
      <AvatarFallback className="bg-accent text-accent-foreground text-xs">
        {initialsOf(actor.name)}
      </AvatarFallback>
    </Avatar>
  );

const TimelineConnector = () => (
  <span
    aria-hidden
    className="-bottom-4 -translate-x-1/2 absolute top-8 left-4 w-px bg-border"
  />
);

const TimelineRow = ({
  entry,
  isLast,
}: {
  entry: TimelineEntry;
  isLast: boolean;
}) => (
  <li
    className="relative flex items-start gap-3 text-sm"
    aria-label={entry.kind}
  >
    {!isLast && <TimelineConnector />}
    <ActorAvatar actor={entry.actor} />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-semibold">
          {entry.actor.isAgent ? AGENT_DISPLAY_NAME : entry.actor.name}
        </span>
        {entry.actor.isAgent && <AgentBadge />}
        <span className="text-xs text-muted-foreground">
          {formatScheduled(entry.createdAt, "·")}
        </span>
      </div>
      <div className="text-muted-foreground">{entry.body}</div>
    </div>
  </li>
);

export const ActivityTimeline = ({
  entries,
  action,
  children,
  footer,
  emptyMessage = "No activity yet.",
}: {
  entries: TimelineEntry[];
  action?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  emptyMessage?: string;
}) => {
  const newestFirst = [...entries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const eventCount = newestFirst.length;

  return (
    <CollapsibleSectionCard
      title="Activity"
      meta={`${eventCount} event${eventCount === 1 ? "" : "s"}`}
      action={action}
    >
      <div className="flex flex-col gap-4">
        {children}
        {eventCount > 0 ? (
          <ul className="flex flex-col gap-4">
            {newestFirst.map((entry, index) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                isLast={index === eventCount - 1}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
        {footer && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </CollapsibleSectionCard>
  );
};
