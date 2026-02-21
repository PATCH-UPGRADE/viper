import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useAssetDetailParams } from "@/features/assets/hooks/use-asset-params";
import { IssueStatus } from "@/generated/prisma";
import { useTRPC } from "@/trpc/client";

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
        queryClient.invalidateQueries(
          trpc.issues.getManyInternalByStatusAndAssetId.queryFilter({
            assetId: data.assetId,
          }),
        );
        queryClient.invalidateQueries(
          trpc.assets.getIssueMetricsInternal.queryFilter(),
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
  assetId,
  issueStatus,
}: {
  assetId: string;
  issueStatus: IssueStatus;
}) => {
  const trpc = useTRPC();
  const [params] = useAssetDetailParams();

  let page = 1;
  for (const status of Object.values(IssueStatus)) {
    if (params.issueStatus === status) {
      const key = `${status.toLowerCase()}Page`;
      if (key in params) {
        const val = params[key as keyof typeof params];
        if (typeof val === "number") {
          page = val;
          break;
        }
      }
    }
  }

  return useSuspenseQuery(
    trpc.issues.getManyInternalByStatusAndAssetId.queryOptions({
      ...params,
      assetId,
      issueStatus,
      page,
    }),
  );
};
