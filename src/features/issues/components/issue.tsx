"use client";

import { BugIcon, ChevronDown, ComputerIcon, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetItem } from "@/features/assets/components/assets";
import { locationSchema } from "@/features/assets/types";
import { VulnerabilityItem } from "@/features/vulnerabilities/components/vulnerabilities";
import { type Issue, IssueStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useSuspenseIssue,
  useSuspenseIssuesById,
  useUpdateIssueStatus,
} from "../hooks/use-issues";
import type { IssueWithRelations } from "../types";

const statusDetails = {
  [IssueStatus.FALSE_POSITIVE]: {
    name: "False Positive",
    color: "bg-yellow-500",
  },
  [IssueStatus.ACTIVE]: { name: "Active", color: "bg-red-500" },
  [IssueStatus.REMEDIATED]: { name: "Remediated", color: "bg-green-500" },
};

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  const statusDetail = statusDetails[status];
  return <Badge className={statusDetail.color}>{statusDetail.name}</Badge>;
};

export const IssueLoading = () => {
  return <LoadingView message="Loading issue..." />;
};

export const IssueError = () => {
  return <ErrorView message="Error loading issue" />;
};

export const IssueContainer = ({ children }: { children: React.ReactNode }) => {
  return <EntityContainer>{children}</EntityContainer>;
};

export const IssueStatusForm = ({
  issue,
  className,
}: {
  issue: Issue | IssueWithRelations;
  className?: string;
}) => {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const updateIssueStatus = useUpdateIssueStatus();
  const lastSubmittedStatusRef = useRef<IssueStatus>(issue.status);

  useEffect(() => {
    // Don't submit if status hasn't changed or if we already submitted this status
    if (status === issue.status || status === lastSubmittedStatusRef.current) {
      return;
    }

    const updateStatus = async () => {
      lastSubmittedStatusRef.current = status;
      try {
        await updateIssueStatus.mutateAsync({
          id: issue.id,
          status: status,
        });
      } catch {
        setStatus(issue.status);
        lastSubmittedStatusRef.current = issue.status;
      }
    };

    updateStatus();
  }, [status, issue.id, issue.status, updateIssueStatus]);

  const statusDetail = statusDetails[status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={(e) => {
          e.stopPropagation();
        }}
        className={className}
      >
        <Badge className={statusDetail.color}>
          {statusDetail.name} <ChevronDown className="ml-2" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.values(IssueStatus)
          .filter((s) => s !== status)
          .map((s) => (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setStatus(s);
              }}
              key={s}
            >
              <IssueStatusBadge status={s} />
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const IssueDetailPage = ({ id }: { id: string }) => {
  const issue = useSuspenseIssue(id);

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-x-4 mb-4">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-semibold">Issue</h1>
        </div>
        <IssueStatusForm issue={issue.data} />
      </div>
      <h2 className="text-lg font-semibold">Asset</h2>
      <AssetItem data={issue.data.asset} />
      <h2 className="text-lg font-semibold">Vulnerability</h2>
      <VulnerabilityItem data={issue.data.vulnerability} />
    </>
  );
};

const ACTIVE_ISSUES_SHOWN_MAX = 5;

export const IssuesSidebarList = ({
  issues,
  type,
}: {
  issues: Issue[];
  type: "assets" | "vulnerabilities";
}) => {
  const issuesQuery = useSuspenseIssuesById({
    ids: issues.map((i) => i.id),
    type,
  });
  const issuesMap = issuesQuery.data.reduce<{
    [key: string]: IssueWithRelations;
  }>((acc, issue) => {
    acc[issue.id] = issue;
    return acc;
  }, {});

  if (issues.length === 0) return null;

  const assetId = issues[0].assetId;
  const isIssuesOverflow = issues.length > ACTIVE_ISSUES_SHOWN_MAX;
  const visibleIssues = issues.slice(
    0,
    isIssuesOverflow ? ACTIVE_ISSUES_SHOWN_MAX : issues.length,
  );

  const nonActiveIssuesCount = Object.values(IssueStatus)
    .filter((status) => status !== IssueStatus.ACTIVE)
    .map((issueStatus) => ({
      issueStatus,
      count: issues.filter((i) => i.status === issueStatus).length,
    }))
    .filter(({ count }) => count > 0);

  const Icon = type === "vulnerabilities" ? BugIcon : ComputerIcon;

  return (
    <>
      <h4 className="text-xs font-semibold text-muted-foreground mt-4 mb-2">
        Active Issues
      </h4>
      <ul className="flex flex-col gap-2">
        {visibleIssues.map((issue) => {
          const issueData = issuesMap[issue.id];
          if (!issueData) return null;
          const asset = issueData.asset;
          const locationResult = asset?.location
            ? locationSchema.safeParse(asset.location)
            : null;
          const location = locationResult?.success ? locationResult.data : null;
          const locationParts = [
            location?.facility,
            location?.building,
            location?.floor,
            location?.room,
          ].filter(Boolean);

          return (
            <li key={issue.id}>
              <Link
                href={`/issues/${issue.id}`}
                className="flex py-3 px-4 items-center gap-4 rounded-md border-1 border-accent cursor-pointer hover:bg-muted transition-all"
                aria-label="Navigate to issue"
              >
                <Icon
                  className={cn(
                    "min-w-4 min-h-4 h-4 w-4",
                    type === "vulnerabilities" ? "text-destructive" : "",
                  )}
                  size={16}
                />
                {type === "vulnerabilities" ? (
                  <div className="text-xs flex-1">
                    <p className="font-semibold mb-2">
                      {issueData.vulnerability?.description}
                    </p>
                    <IssueStatusForm issue={issue} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold">{asset?.role}</p>
                      {locationParts.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {locationParts.join(" • ")}
                        </p>
                      )}
                    </div>
                    <IssueStatusForm className="ml-auto" issue={issue} />
                  </>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuItem
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer"
                      asChild
                    >
                      <Link href={`/issues/${issue.id}`}>
                        Go to Issue Details
                      </Link>
                    </DropdownMenuItem>
                    {type === "vulnerabilities" && (
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                        asChild
                      >
                        <Link
                          href={`/vulnerabilities/${issue.vulnerabilityId}`}
                        >
                          Go to Vulnerability Details
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {type === "assets" && (
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                        asChild
                      >
                        <Link href={`/assets/${issue.assetId}`}>
                          Go to Asset Details
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Link>
            </li>
          );
        })}
      </ul>

      {isIssuesOverflow && (
        <div className="flex justify-between pt-2">
          <p>
            Viewing {ACTIVE_ISSUES_SHOWN_MAX} of {issues.length} Active Issues
          </p>
          <Link
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            href={`/assets/${assetId}`}
          >
            View All Active Issues
          </Link>
        </div>
      )}

      {nonActiveIssuesCount.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <h5 className="font-bold">Non-Active Issues</h5>
          {nonActiveIssuesCount.map(({ issueStatus, count }) => (
            <Link
              key={issueStatus}
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              href={`/assets/${assetId}?issueStatus=${issueStatus}`}
            >
              View {count} {statusDetails[issueStatus].name} Issue
              {count > 1 ? "s" : ""}
            </Link>
          ))}
        </div>
      )}
    </>
  );
};
