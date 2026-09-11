import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useRemediationsParams } from "./use-remediations-params";

/**
 * Hook to fetch all remediations using suspense
 */
export const useSuspenseRemediations = () => {
  const trpc = useTRPC();
  const [params] = useRemediationsParams();

  return useSuspenseQuery(trpc.remediations.getMany.queryOptions(params));
};

/**
 * Hook to create a new remediation
 */
export const useCreateRemediation = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.remediations.create.mutationOptions({
      onSuccess: (_data) => {
        toast.success("Remediation created");
        // Invalidate all getMany queries regardless of params (page, search, etc.)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const baseKey = trpc.remediations.getMany.queryKey();
            return query.queryKey[0] === baseKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to create remediation: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update a remediation
 */
export const useUpdateRemediation = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.remediations.update.mutationOptions({
      onSuccess: (_data) => {
        toast.success("Remediation updated");
        // Invalidate all getMany queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.remediations.getMany.queryKey();
            const getOneKey = trpc.remediations.getOne.queryKey();
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to update remediation: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove a remediation
 */
export const useRemoveRemediation = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.remediations.remove.mutationOptions({
      onSuccess: (_data) => {
        toast.success("Remediation removed");
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.remediations.getMany.queryKey();
            const getOneKey = trpc.remediations.getOne.queryKey();
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove remediation: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to fetch a single remediation using suspense
 */
export const useSuspenseRemediation = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.remediations.getOne.queryOptions({ id }));
};

/**
 * Comments other hospitals left on this remediation.
 *
 * A plain query rather than a suspense one: this reaches a third party over the
 * network, so the page should render without waiting on it, and a slow or
 * unreachable platform must not blank the whole page.
 */
export const useRemediationComments = (
  remediationId: string,
  cursor?: string | null,
) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.remediations.getComments.queryOptions({ remediationId, cursor }),
    placeholderData: keepPreviousData,
  });
};

export const useAddRemediationComment = (remediationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.remediations.addComment.mutationOptions({
      onSuccess: () => {
        toast.success("Comment posted");
        queryClient.invalidateQueries(
          trpc.remediations.getComments.queryFilter({ remediationId }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to post comment: ${error.message}`);
      },
    }),
  );
};

/**
 * Questions we asked the manufacturer about this remediation. Private to us,
 * so unlike comments there is no other hospital's content here.
 */
export const useRemediationInquiries = (
  remediationId: string,
  cursor?: string | null,
) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.remediations.getInquiries.queryOptions({ remediationId, cursor }),
    placeholderData: keepPreviousData,
  });
};

export const useAddRemediationInquiry = (remediationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.remediations.addInquiry.mutationOptions({
      onSuccess: () => {
        toast.success("Question sent to the manufacturer");
        queryClient.invalidateQueries(
          trpc.remediations.getInquiries.queryFilter({ remediationId }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to send question: ${error.message}`);
      },
    }),
  );
};
