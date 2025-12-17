"use client";

import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { IssueStatus, Issue } from "@/generated/prisma";
import {
  useSuspenseIssue,
  useSuspenseIssuesById,
  useUpdateIssueStatus,
} from "../hooks/use-issues";
import { AssetItem } from "@/features/assets/components/assets";
import { VulnerabilityItem } from "@/features/vulnerabilities/components/vulnerabilities";

import { FullIssue } from "@/lib/db";
import { useCallback, useEffect, useState } from "react";
import { BugIcon, ChevronDown, ComputerIcon, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CopyCode } from "@/components/ui/code";
import { cn } from "@/lib/utils";

const statusDetails = {
  [IssueStatus.FALSE_POSITIVE]: {
    name: "False Positive",
    color: "bg-yellow-500",
  },
  [IssueStatus.PENDING]: { name: "Active", color: "bg-red-500" },
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
  issue: Issue | FullIssue;
  className?: string;
}) => {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const updateIssueStatus = useUpdateIssueStatus();

  const handleSave = useCallback(async () => {
    if (status === issue.status) {
      return;
    }

    try {
      await updateIssueStatus.mutateAsync({
        id: issue.id,
        status: status,
      });
    } catch {
      setStatus(issue.status);
    }
  }, [status, issue, updateIssueStatus]);

  useEffect(() => {
    handleSave();
  }, [status]);

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

export const IssuesSidebarList = ({
  issues,
  type,
}: {
  issues: Issue[];
  type: "assets" | "vulnerabilities";
}) => {
  const router = useRouter();
  const issuesQuery = useSuspenseIssuesById({
    ids: issues.map((i) => i.id),
    type,
  });
  const issuesMap = issuesQuery.data.reduce<{ [key: string]: FullIssue }>(
    (accumulator, currentObject) => {
      accumulator[currentObject.id] = currentObject;
      return accumulator;
    },
    {},
  );

  if (issues.length === 0) return null;

  const Icon = type === "vulnerabilities" ? BugIcon : ComputerIcon;

  return (
    <>
      <h4 className="text-xs font-semibold text-muted-foreground mt-4 mb-2">
        Active Issues
      </h4>
      <ul className="flex flex-col gap-2">
        {issues.map((issue) => (
          <li
            key={issue.id}
            className="flex py-3 px-4 items-center gap-4 rounded-md border-1 border-accent cursor-pointer hover:bg-muted transition-all"
            onClick={() => router.push(`/issues/${issue.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/issues/${issue.id}`);
              }
            }}
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
                  {issuesMap[issue.id].vulnerability?.description}
                </p>
                <IssueStatusForm issue={issue} />
              </div>
            ) : (
              <>
                <p className="font-semibold">
                  {issuesMap[issue.id].asset?.role}
                </p>
                {/*<CopyCode>{issue.id}</CopyCode>*/}
                <IssueStatusForm className="ml-auto" issue={issue} />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                onClick={(e) => {
                  e.stopPropagation();
                }}
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
                  <Link href={`/issues/${issue.id}`}>Go to Issue Details</Link>
                </DropdownMenuItem>
                {type === "vulnerabilities" && (
                  <DropdownMenuItem
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                    asChild
                  >
                    <Link href={`/vulnerabilities/${issue.vulnerabilityId}`}>
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
          </li>
        ))}
      </ul>
    </>
  );
};
