import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  IssueContainer,
  IssueDetailPage,
  IssueError,
  IssueLoading,
} from "@/features/issues/components/issue";
import { prefetchIssue } from "@/features/issues/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    issueId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { issueId } = await params;

  prefetchIssue(issueId);

  return (
    <IssueContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<IssueError />}>
          <Suspense fallback={<IssueLoading />}>
            <IssueDetailPage id={issueId} />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </IssueContainer>
  );
};
export default Page;
