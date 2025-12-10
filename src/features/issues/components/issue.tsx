"use client";

import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { IssueStatus, Issue } from "@/generated/prisma";
import { useSuspenseIssue, useUpdateIssueStatus } from "../hooks/use-issues";
import { AssetItem } from "@/features/assets/components/assets";
import { VulnerabilityItem } from "@/features/vulnerabilities/components/vulnerabilities";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullIssue } from "@/lib/db";
import { useEffect, useState } from "react";

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  const statusDetails = {
    [IssueStatus.FALSE_POSITIVE]: {
      name: "False Positive",
      color: "bg-red-500",
    },
    [IssueStatus.PENDING]: { name: "Pending", color: "bg-yellow-500" },
    [IssueStatus.REMEDIATED]: { name: "Remediated", color: "bg-green-500" },
  };
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

export const IssueStatusForm = ({ issue }: { issue: Issue | FullIssue }) => {
  const [status, setStatus] = useState<string>(issue.status);
  const updateIssueStatus = useUpdateIssueStatus();

  const handleSave = async () => {
    if (status === issue.status) {
      return;
    }

    try {
      await updateIssueStatus.mutateAsync({
        id: issue.id,
        status,
      });
    } catch {
      setStatus(issue.status);
    }
  };

  useEffect(() => {
    handleSave();
  }, [status]);

  return (
    <Select
      value={status}
      onValueChange={(val: string) => {
        setStatus(val);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a status" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Issue Status</SelectLabel>
          {Object.values(IssueStatus).map((s) => (
            <SelectItem value={s}>
              <IssueStatusBadge status={s} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
