"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, MailIcon, RssIcon } from "lucide-react";
import Link from "next/link";
import { PriorityBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdvisoriesQuery } from "../hooks/use-notifications";
import type { AssetAdvisory, AssetAdvisorySource } from "../types";
import { NotificationTypeBadge } from "./notification-type-badge";

export const ADVISORY_PAGE_SIZE = 10;

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
      <span className="truncate max-w-40">{source.label}</span>
      {source.url && (
        <ExternalLinkIcon
          className="size-3 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </span>
  );

  if (!source.url) {
    return <span className="text-xs text-muted-foreground">{body}</span>;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground hover:underline"
      // The row is a link to the advisory; this one leaves the app.
      onClick={(event) => event.stopPropagation()}
      aria-label={`Open the ${source.label} advisory in a new tab`}
    >
      {body}
    </a>
  );
}

function AdvisoryRow({ advisory }: { advisory: AssetAdvisory }) {
  return (
    <Link
      href={`/inbox/${advisory.id}`}
      className="flex flex-col gap-1.5 rounded-md border p-3 hover:bg-accent"
    >
      <span className="flex items-center gap-2">
        {advisory.isUnread && (
          <>
            <span
              className="size-2 rounded-full bg-primary shrink-0"
              aria-hidden="true"
            />
            <span className="sr-only">Unread</span>
          </>
        )}
        {advisory.priority && <PriorityBadge priority={advisory.priority} />}
        <NotificationTypeBadge type={advisory.type} />
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDistanceToNow(advisory.createdAt, { addSuffix: true })}
        </span>
      </span>

      <span className="text-sm font-medium">
        {advisory.title ?? "Untitled advisory"}
      </span>
      {advisory.summary && (
        <span className="text-xs text-muted-foreground line-clamp-2">
          {advisory.summary}
        </span>
      )}

      {advisory.sources.length > 0 && (
        <span className="flex flex-wrap gap-2">
          {advisory.sources.map((source, index) => (
            <SourcePill
              key={`${source.label}-${source.observedAt}-${index}`}
              source={source}
            />
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * A page of advisories inside a dashboard drawer. What they are advisories
 * *about* is the caller's business — it supplies the query.
 *
 * The page state is owned by the drawer rather than the url. The list behind
 * the drawer reads the same url pagination params, so paging here would page
 * the table underneath.
 */
export const AdvisoriesSection = ({
  query,
  page,
  setPage,
  emptyMessage,
}: {
  query: AdvisoriesQuery;
  page: number;
  setPage: (page: number) => void;
  emptyMessage: string;
}) => {
  const { data, isLoading, isError } = query;

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Advisories could not be loaded.
      </p>
    );
  }

  if (!data || data.totalCount === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <RssIcon
            className="h-12 w-12 mx-auto opacity-50"
            aria-hidden="true"
          />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.items.map((advisory) => (
        <AdvisoryRow key={advisory.id} advisory={advisory} />
      ))}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!data.hasPreviousPage}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.hasNextPage}
              onClick={() => setPage(page + 1)}
            >
              Older
            </Button>
          </span>
        </div>
      )}
    </div>
  );
};
