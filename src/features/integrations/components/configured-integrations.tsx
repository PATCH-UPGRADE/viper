"use client";

import { ChevronRightIcon } from "lucide-react";
import ms from "ms";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getChipClass } from "@/features/tag-colors/palette";
import { relativeTime } from "@/lib/date-utils";
import { cn, plural } from "@/lib/utils";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";
import type { ConfiguredRow, PlatformUploads } from "./configured-rows";
import {
  type ConnectorState,
  type ConnectorView,
  integrationView,
  recordLabel,
  streamName,
  streamView,
  uploadGroupView,
  uploadView,
} from "./connector-status";
import { IntegrationActionsMenu, StreamActionsMenu } from "./integration-row";
import { PlatformAvatar } from "./platform-avatar";

/** Colors come from the shared chip palette, so these badges match tag chips elsewhere in the app. */
const STATE_BADGES: Record<
  ConnectorState,
  { label: string; className: string }
> = {
  healthy: { label: "Healthy", className: getChipClass("emerald") },
  failing: { label: "Failing", className: getChipClass("red") },
  paused: { label: "Paused", className: getChipClass("zinc") },
  unknown: { label: "Unknown", className: getChipClass("zinc") },
  importing: { label: "Importing", className: getChipClass("sky") },
};

/** A failing badge with an error message underlines itself, like an <abbr>, and shows the message on hover or focus. */
export const StatusBadge = ({
  state,
  errorMessage,
}: Pick<ConnectorView, "state" | "errorMessage">) => {
  const { label, className } = STATE_BADGES[state];
  if (!errorMessage) {
    return <Badge className={className}>{label}</Badge>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          asChild
          className={cn(
            className,
            "cursor-help underline decoration-dotted underline-offset-3",
          )}
        >
          <button type="button">{label}</button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{errorMessage}</TooltipContent>
    </Tooltip>
  );
};

const scheduleLine = (schedule: NonNullable<ConnectorView["schedule"]>) => {
  const every = `Every ${schedule.every.map((seconds) => ms(seconds * 1000)).join(" / ")}`;
  if (schedule.isDue) return `${every} · sync due`;
  if (schedule.nextSyncAt)
    return `${every} · next ${relativeTime(schedule.nextSyncAt)}`;
  return every;
};

const LastSyncCell = ({ view }: { view: ConnectorView }) => {
  const when = view.lastAt ? relativeTime(view.lastAt) : null;
  return (
    <TableCell>
      <div
        className={cn(
          view.state === "failing" ? "text-destructive" : "text-foreground",
        )}
      >
        {view.schedule
          ? (when ?? "Never synced")
          : when
            ? `Uploaded ${when}`
            : "Not uploaded yet"}
      </div>
      {view.schedule && (
        <div className="text-xs text-muted-foreground">
          {scheduleLine(view.schedule)}
        </div>
      )}
    </TableCell>
  );
};

/**
 * "128 assets", one line per record type, or "0" when there are none. Spans rather than a list,
 * so it can also sit inside a button (the edit picker's rows).
 */
export const RecordsList = ({
  records,
  className,
}: {
  records: ConnectorView["records"];
  className?: string;
}) =>
  records.length === 0 ? (
    <span className={className}>0</span>
  ) : (
    <span className={cn("flex flex-col gap-0.5", className)}>
      {records.map((record) => (
        <span key={record.resource}>{recordLabel(record)}</span>
      ))}
    </span>
  );

const RecordsCell = ({ view }: { view: ConnectorView }) => (
  <TableCell>
    <RecordsList records={view.records} />
  </TableCell>
);

const ExpandButton = ({
  name,
  expanded,
  onToggle,
}: {
  name: string;
  expanded: boolean;
  onToggle?: () => void;
}) =>
  onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
    >
      <ChevronRightIcon
        className={cn("size-4 transition-transform", expanded && "rotate-90")}
      />
    </button>
  ) : (
    <span className="size-6 shrink-0" aria-hidden="true" />
  );

/** The top-level row: an integration, or a platform's uploads. */
const ParentRow = ({
  title,
  subtitle,
  view,
  expanded,
  onToggle,
  menu,
}: {
  title: string;
  subtitle: string;
  view: ConnectorView;
  expanded: boolean;
  onToggle?: () => void;
  menu?: React.ReactNode;
}) => (
  <TableRow>
    <TableCell className="max-w-0 min-w-56 pl-3">
      <div className="flex min-w-0 items-center gap-2">
        <ExpandButton name={title} expanded={expanded} onToggle={onToggle} />
        <PlatformAvatar name={title} className="size-8" />
        <div className={cn("min-w-0", view.state === "paused" && "opacity-60")}>
          <div className="truncate font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>
    </TableCell>
    <TableCell>
      <StatusBadge state={view.state} errorMessage={view.errorMessage} />
    </TableCell>
    <LastSyncCell view={view} />
    <RecordsCell view={view} />
    <TableCell className="text-right">{menu}</TableCell>
  </TableRow>
);

/** A stream of an integration, or one upload, nested under its parent. */
const ChildRow = ({
  name,
  view,
  menu,
}: {
  name: string;
  view: ConnectorView;
  menu: React.ReactNode;
}) => (
  <TableRow className="bg-muted/30">
    <TableCell className="max-w-0 min-w-56 pl-3">
      <div
        className={cn(
          "truncate pl-[4.5rem] font-medium",
          view.state === "paused" && "opacity-60",
        )}
      >
        {name}
      </div>
    </TableCell>
    <TableCell>
      <StatusBadge state={view.state} errorMessage={view.errorMessage} />
    </TableCell>
    <LastSyncCell view={view} />
    <RecordsCell view={view} />
    <TableCell className="text-right">{menu}</TableCell>
  </TableRow>
);

const IntegrationRows = ({
  row,
  expanded,
  onToggle,
}: {
  row: Extract<ConfiguredRow, { kind: "integration" }>;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const { integration, catalogEntry } = row;
  const syncs = integration.resourceSyncs;
  const hasStreams = syncs.length > 1;
  return (
    <>
      <ParentRow
        title={integration.name}
        subtitle={
          hasStreams
            ? `${integration.platformLabel} · ${syncs.length} streams`
            : integration.platformLabel
        }
        view={integrationView(integration)}
        expanded={hasStreams && expanded}
        onToggle={hasStreams ? onToggle : undefined}
        menu={
          <IntegrationActionsMenu
            integration={integration}
            catalogEntry={catalogEntry}
          />
        }
      />
      {hasStreams &&
        expanded &&
        syncs.map((sync: IntegrationResourceSyncItem) => (
          <ChildRow
            key={sync.resource}
            name={streamName(sync.resource)}
            view={streamView(integration, sync)}
            menu={<StreamActionsMenu integration={integration} sync={sync} />}
          />
        ))}
    </>
  );
};

const UploadRows = ({
  catalogEntry,
  uploads,
  expanded,
  onToggle,
}: PlatformUploads & { expanded: boolean; onToggle: () => void }) => (
  <>
    <ParentRow
      title={catalogEntry.displayName}
      subtitle={`${uploads.length} ${plural("upload", uploads.length)}`}
      view={uploadGroupView(uploads)}
      expanded={expanded}
      onToggle={onToggle}
    />
    {expanded &&
      uploads.map((upload: IntegrationListItem) => (
        <ChildRow
          key={upload.id}
          name={upload.name}
          view={uploadView(upload)}
          menu={
            <IntegrationActionsMenu
              integration={upload}
              catalogEntry={catalogEntry}
            />
          }
        />
      ))}
  </>
);

const HEAD_CLASS = "text-xs uppercase tracking-wide text-muted-foreground";

const rowKey = (row: ConfiguredRow) =>
  row.kind === "uploads"
    ? `uploads:${row.catalogEntry.platform}`
    : row.integration.id;

/** Every row with children starts expanded. */
export const ConfiguredIntegrationsTable = ({
  rows,
}: {
  rows: ConfiguredRow[];
}) => {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn("w-full min-w-56 pl-11", HEAD_CLASS)}>
              Integration
            </TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={HEAD_CLASS}>Last sync</TableHead>
            <TableHead className={HEAD_CLASS}>Records</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            const expanded = !collapsed.has(key);
            return (
              <Fragment key={key}>
                {row.kind === "uploads" ? (
                  <UploadRows
                    catalogEntry={row.catalogEntry}
                    uploads={row.uploads}
                    expanded={expanded}
                    onToggle={() => toggle(key)}
                  />
                ) : (
                  <IntegrationRows
                    row={row}
                    expanded={expanded}
                    onToggle={() => toggle(key)}
                  />
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
