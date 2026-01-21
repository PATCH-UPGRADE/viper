import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { IssueStatus } from "@/generated/prisma";

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
  status,
}: {
  id: string;
  status: IssueStatus;
}) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.issues.getManyInternalByAssetId.queryOptions({ id, status }),
  );
};
