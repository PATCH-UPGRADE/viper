"use client";

import { BugIcon, ComputerIcon } from "lucide-react";
import Link from "next/link";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { StatusFormBase, statusDetails } from "@/components/status-form";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import { AssetItem } from "@/features/assets/components/assets";
import { locationSchema } from "@/features/assets/types";
import { getAssetRoleLabel } from "@/features/assets/utils";
import { VulnerabilityItem } from "@/features/vulnerabilities/components/vulnerabilities";
import { type Issue, IssueStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useSuspenseIssue,
  useSuspenseIssuesById,
  useUpdateIssueStatus,
} from "../hooks/use-issues";
import type { IssueWithRelations } from "../types";

export { IssueStatusBadge } from "@/components/status-form";

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
  const updateIssueStatus = useUpdateIssueStatus();
  return (
    <StatusFormBase
      id={issue.id}
      initialStatus={issue.status}
      onUpdate={(input) => updateIssueStatus.mutateAsync(input)}
      className={className}
    />
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
                      <p className="font-semibold">
                        {getAssetRoleLabel(asset)}
                      </p>
                      {locationParts.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {locationParts.join(" • ")}
                        </p>
                      )}
                    </div>
                    <IssueStatusForm className="ml-auto" issue={issue} />
                  </>
                )}

                <MoreVerticalDropdownMenu
                  contentClassName="w-[200px]"
                  items={[
                    {
                      label: "Go to Issue Details",
                      href: `/issues/${issue.id}`,
                      className: "cursor-pointer",
                    },
                    type === "vulnerabilities" && {
                      label: "Go to Vulnerability Details",
                      href: `/vulnerabilities/${issue.vulnerabilityId}`,
                      className: "cursor-pointer",
                    },
                    type === "assets" && {
                      label: "Go to Asset Details",
                      href: `/assets/${issue.assetId}`,
                      className: "cursor-pointer",
                    },
                  ]}
                />
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
