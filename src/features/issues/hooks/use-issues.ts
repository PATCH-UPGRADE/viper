import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { IssueStatus } from "@/generated/prisma";
import { useAssetDetailParams } from "@/features/assets/hooks/use-asset-detail-params";

/**
 * Hook to update an issue status
 */
export const useUpdateIssueStatus = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.issues.updateStatus.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Issue status updated`);
        queryClient.invalidateQueries(
          trpc.issues.getOne.queryFilter({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to update issue status: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single issue using suspense
 */
export const useSuspenseIssue = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.issues.getOne.queryOptions({ id }));
};

export const useSuspenseIssuesById = ({
  ids,
  type,
}: {
  ids: string[];
  type: "assets" | "vulnerabilities";
}) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.issues.getManyByIds.queryOptions({ ids, type }));
};

export const useSuspenseIssuesByAssetId = ({
  id,
  issueStatus,
}: {
  id: string;
  issueStatus: IssueStatus;
}) => {
  const trpc = useTRPC();
  const [params] = useAssetDetailParams();

  let page = 1;
  if (params.issueStatus === IssueStatus.PENDING.toString()) {
    page = params.activeIssuePage;
  } else if (params.issueStatus === IssueStatus.FALSE_POSITIVE.toString()) {
    page = params.falsePosIssuePage;
  } else if (params.issueStatus === IssueStatus.REMEDIATED.toString()) {
    page = params.remediatedIssuePage;
  }

  return useSuspenseQuery(
    trpc.issues.getManyInternalByStatusAndAssetId.queryOptions({
      ...params,
      id,
      issueStatus,
      page,
    }),
  );
};
