import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkflowsParams } from "./use-workflows-params";

/**
 * Hook to fetch all workflows using suspense
 */
export const useSuspenseWorkflows = () => {
  const trpc = useTRPC();
  const [params] = useWorkflowsParams();
  
  return useSuspenseQuery(trpc.workflows.getMany.queryOptions(params));
};

/**
 * Hook to create a new workflow
 */
export const useCreateWorkflow = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" created`);
        // Invalidate all getMany queries regardless of params (page, search, etc.)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const baseKey = trpc.workflows.getMany.queryKey();
            return query.queryKey[0] === baseKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to create workflow: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to remove a workflow
 */
export const useRemoveWorkflow = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.workflows.remove.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" removed`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.workflows.getMany.queryKey();
            const getOneKey = trpc.workflows.getOne.queryKey();
            return query.queryKey[0] === getManyKey[0] || query.queryKey[0] === getOneKey[0];
          },
        });
      }
    })
  )
}

/**
 * Hook to fetch a single workflow using suspense
 */
export const useSuspenseWorkflow = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.workflows.getOne.queryOptions({ id }));
};

/**
 * Hook to update a workflow name
 */
export const useUpdateWorkflowName = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.updateName.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" updated`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.workflows.getMany.queryKey();
            const getOneKey = trpc.workflows.getOne.queryKey();
            return query.queryKey[0] === getManyKey[0] || query.queryKey[0] === getOneKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to update workflow: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to update a workflow
 */
export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.update.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" saved`);
        // Invalidate all getMany and getOne queries regardless of params
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.workflows.getMany.queryKey();
            const getOneKey = trpc.workflows.getOne.queryKey();
            return query.queryKey[0] === getManyKey[0] || query.queryKey[0] === getOneKey[0];
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to save workflow: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to execute a workflow
 */
export const useExecuteWorkflow = () => {
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.execute.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" executed`);
      },
      onError: (error) => {
        toast.error(`Failed to execute workflow: ${error.message}`);
      },
    }),
  );
  
};
