"use client";

import { EntityContainer, EntityHeader, ErrorView, LoadingView } from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { IssueStatus } from "@/generated/prisma";
import { useSuspenseIssue } from "../hooks/use-issues";
import { AssetItem } from "@/features/assets/components/assets";

export const IssueStatusBadge = ({status}: {status: IssueStatus}) => {
  return (
    <Badge>{status}</Badge>
  );
}

export const IssueHeader = () => {
  return (
    <EntityHeader
      title="Issue"
    />
  );
};

export const IssueLoading = () => {
  return <LoadingView message="Loading issue..." />;
};

export const IssueError = () => {
  return <ErrorView message="Error loading issue" />;
};

export const IssueContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<IssueHeader />}
    >
      {children}
    </EntityContainer>
  );
};

export const IssueDetailPage = ({id}: {id: string}) => {
  const issue = useSuspenseIssue(id);

  return (
    <>
      <p>TODO {JSON.stringify(issue)}</p>
    </>
  );
};
