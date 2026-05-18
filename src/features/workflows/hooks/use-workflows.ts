import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
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
        queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.workflows.getOne.queryFilter({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to remove workflow: ${error.message}`);
      },
    }),
  );
};

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
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
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
 * Hook to update a workflow description
 */
export const useUpdateWorkflowDescription = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.workflows.updateDescription.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Workflow "${data.name}" description updated`);
        queryClient.invalidateQueries({
          predicate: (query) => {
            const getManyKey = trpc.workflows.getMany.queryKey();
            const getOneKey = trpc.workflows.getOne.queryKey();
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
          },
        });
      },
      onError: (error) => {
        toast.error(`Failed to update workflow description: ${error.message}`);
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
            return (
              query.queryKey[0] === getManyKey[0] ||
              query.queryKey[0] === getOneKey[0]
            );
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

/**
 * Imperative export workflow as Mermaid JSON
 */

export const useExportWorkflowMermaid = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return {
    exportMermaid: (id: string) =>
      queryClient.fetchQuery(trpc.workflows.exportMermaid.queryOptions({ id })),
  };
};

/**
 * Imperative export serialized workflow payload (workflow + Mermaid)
 */
export const useExportWorkflowSerialized = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return {
    exportSerialized: (id: string) =>
      queryClient.fetchQuery(trpc.workflows.serialize.queryOptions({ id })),
  };
};

/**
 * Hook to export and download workflow as Mermaid file with toasts
 */
export const useExportWorkflowMermaidDownload = () => {
  const exportWorkflow = useExportWorkflowMermaid();
  return async (id: string, name: string) => {
    try {
      const result = await exportWorkflow.exportMermaid(id);

      if (!result?.mermaid) {
        toast.error("No Mermaid content returned for this workflow");
        return;
      }

      const blob = new Blob([result.mermaid], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name || "workflow"}.mmd`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Workflow exported as Mermaid");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown export error";
      toast.error(`Export failed: ${message}`);
    }
  };
};

/**
 * Hook to export and download serialized workflow as JSON with Mermaid included
 */
export const useExportWorkflowSerializedDownload = () => {
  const exportWorkflow = useExportWorkflowSerialized();

  return async (id: string, name: string) => {
    try {
      const result = await exportWorkflow.exportSerialized(id);

      if (!result?.workflow || !result?.mermaid) {
        toast.error("No serialized workflow content returned");
        return;
      }

      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name || "workflow"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Workflow exported as serialized JSON");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown export error";
      toast.error(`Export failed: ${message}`);
    }
  };
};
