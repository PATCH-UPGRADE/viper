"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, MailIcon, RssIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { PriorityBadge } from "@/components/priority-badge";
import { DataTable } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { usePaginationParams } from "@/lib/pagination";
import {
  useMarkNotificationRead,
  useSuspenseAssetAdvisories,
} from "../hooks/use-notifications";
import type { AssetAdvisory, AssetAdvisorySource } from "../types";
import { NotificationTypeBadge } from "./notification-type-badge";

/**
 * Who told us. An integration source carries the name of the row an operator
 * configured, and links out when the publisher has a page of its own.
 */
function SourcePill({ source }: { source: AssetAdvisorySource }) {
  const icon =
    source.channel === "Email" ? (
      <MailIcon className="size-3 shrink-0 text-muted-foreground" />
    ) : (
      <RssIcon className="size-3 shrink-0 text-muted-foreground" />
    );

  const body = (
    <span className="flex items-center gap-1.5">
      {icon}
      <span className="truncate max-w-[160px]">{source.label}</span>
      {source.url && (
        <ExternalLinkIcon
          className="size-3 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </span>
  );

  if (!source.url) return <Pill>{body}</Pill>;

  return (
    <Pill>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        // The row navigates to the advisory; this link leaves the app.
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open the ${source.label} advisory in a new tab`}
      >
        {body}
      </a>
    </Pill>
  );
}

const advisoryColumns: ColumnDef<AssetAdvisory>[] = [
  {
    id: "priority",
    accessorKey: "priority",
    meta: { title: "Priority", headerClassName: "w-32" },
    header: () => "Priority",
    cell: ({ row }) => {
      const { priority, isUnread } = row.original;
      return (
        <span className="flex items-center gap-1.5">
          {isUnread && (
            <>
              <span
                className="size-2 rounded-full bg-primary shrink-0"
                aria-hidden="true"
              />
              <span className="sr-only">Unread</span>
            </>
          )}
          {priority ? (
            <PriorityBadge priority={priority} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      );
    },
  },
  {
    id: "type",
    accessorKey: "type",
    meta: { title: "Type", headerClassName: "w-36" },
    header: () => "Type",
    cell: ({ row }) => <NotificationTypeBadge type={row.original.type} />,
  },
  {
    id: "title",
    accessorKey: "title",
    meta: { title: "Advisory" },
    header: () => "Advisory",
    cell: ({ row }) => {
      const { title, summary } = row.original;
      return (
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{title ?? "Untitled advisory"}</span>
          {summary && (
            <span className="text-xs text-muted-foreground line-clamp-2">
              {summary}
            </span>
          )}
        </span>
      );
    },
  },
  {
    id: "sources",
    meta: { title: "Source", headerClassName: "w-56" },
    header: () => "Source",
    cell: ({ row }) => {
      const { sources } = row.original;
      if (sources.length === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <span className="flex flex-wrap gap-1">
          {sources.map((source, index) => (
            <SourcePill
              key={`${source.label}-${source.observedAt}-${index}`}
              source={source}
            />
          ))}
        </span>
      );
    },
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    meta: { title: "Received", headerClassName: "w-40" },
    header: () => "Received",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
      </span>
    ),
  },
];

export const AssetAdvisories = ({ assetId }: { assetId: string }) => {
  const [params] = usePaginationParams();
  const { data, isFetching } = useSuspenseAssetAdvisories({
    assetId,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
  });
  const router = useRouter();
  const markRead = useMarkNotificationRead();

  if (data.totalCount === 0 && !params.search) {
    return (
      <p className="flex justify-center pt-24 text-muted-foreground">
        No advisories affect this asset
      </p>
    );
  }

  return (
    <DataTable
      paginatedData={data}
      columns={advisoryColumns}
      isLoading={isFetching}
      rowOnclick={(row) => {
        markRead.mutate({ notificationId: row.original.id });
        router.push(`/inbox/${row.original.id}`);
      }}
    />
  );
};
