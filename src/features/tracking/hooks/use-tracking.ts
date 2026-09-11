"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { useTrackingParams } from "./use-tracking-params";

export const useSuspenseTrackingTickets = () => {
  const trpc = useTRPC();
  const [params] = useTrackingParams();
  return useSuspenseQuery(trpc.tracking.getMany.queryOptions(params));
};

export const useSuspenseTrackingTicket = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.tracking.getOne.queryOptions({ id }));
};

export const useSuspenseAssetWorkOrders = (assetId: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.tracking.getManyByAssetId.queryOptions({ assetId }),
  );
};

export const useUpdateTicket = (
  ticketId: string,
  relatedTicketId?: string,
  assetId?: string,
) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
        if (relatedTicketId) {
          queryClient.invalidateQueries(
            trpc.tracking.getOne.queryFilter({ id: relatedTicketId }),
          );
        }
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(
          assetId
            ? trpc.tracking.getManyByAssetId.queryFilter({ assetId })
            : trpc.tracking.getManyByAssetId.queryFilter(),
        );
        toast.success("Ticket updated");
      },
      onError: (error) => {
        toast.error(`Failed to update ticket: ${error.message}`);
      },
    }),
  );
};

/**
 * How far a proposed work order has got. Polled while it is being filed, so the
 * card can move from "Submitting" to the platform's ids without a reload, and
 * re-read on reload so an approved order never offers Approve again.
 */
export const useWorkOrderDraft = (ticketId: string) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.tracking.getWorkOrderDraft.queryOptions({ ticketId }),
    refetchInterval: (query) =>
      query.state.data?.submissionState === "SUBMITTING" ? 2000 : false,
  });
};

/** Approve a proposal: track it here, and file it on the managing platform. */
export const useApproveWorkOrder = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.approveWorkOrder.mutationOptions({
      onSuccess: (data, variables) => {
        if (data.submissionState === "SUBMITTING") {
          toast.success("Approved — filing it with the vendor now");
        } else if (data.submissionState === "SUBMITTED") {
          toast.info("This work order was already filed");
        } else {
          toast.success("Approved and tracked in VIPER");
        }
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(
          trpc.tracking.getWorkOrderDraft.queryFilter({
            ticketId: variables.ticketId,
          }),
        );
      },
      onError: (error) => {
        toast.error(`Could not approve the work order: ${error.message}`);
      },
    }),
  );
};

export const useAssignableUsers = () => {
  const trpc = useTRPC();
  return useQuery(trpc.user.listAssignable.queryOptions());
};

export const useDepartments = () => {
  const trpc = useTRPC();
  return useQuery(trpc.departments.getMany.queryOptions());
};

export const useMarkTicketSeen = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.markSeen.mutationOptions({
      // Optimistically clear the unread-comments indicator on every cached
      // tracking list that contains this ticket (top-level or nested).
      onMutate: async ({ ticketId }) => {
        const filter = trpc.tracking.getMany.queryFilter();
        await queryClient.cancelQueries(filter);
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape varies
        queryClient.setQueriesData<any>(filter, (old: any) => {
          if (!old?.items) return old;
          const clear = (row: { id: string }) =>
            row.id === ticketId ? { ...row, hasUnreadComments: false } : row;
          return {
            ...old,
            items: old.items.map(
              // biome-ignore lint/suspicious/noExplicitAny: nested row shape
              (item: any) => {
                const cleared = clear(item);
                if (!item.children) return cleared;
                return { ...cleared, children: item.children.map(clear) };
              },
            ),
          };
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
      },
    }),
  );
};

export const useSetWatching = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.setWatching.mutationOptions({
      // Optimistically flip the watch state on every cached tracking list that
      // contains this ticket (top-level or nested) plus its detail view. The
      // server response lands afterwards, and `onSettled` reconciles on error.
      onMutate: async ({ ticketId, watching }) => {
        const listFilter = trpc.tracking.getMany.queryFilter();
        const detailFilter = trpc.tracking.getOne.queryFilter({ id: ticketId });
        await Promise.all([
          queryClient.cancelQueries(listFilter),
          queryClient.cancelQueries(detailFilter),
        ]);
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape varies
        queryClient.setQueriesData<any>(listFilter, (old: any) => {
          if (!old?.items) return old;
          const flip = (row: { id: string }) =>
            row.id === ticketId ? { ...row, isWatching: watching } : row;
          return {
            ...old,
            items: old.items.map(
              // biome-ignore lint/suspicious/noExplicitAny: nested row shape
              (item: any) => {
                const flipped = flip(item);
                if (!item.children) return flipped;
                return {
                  ...flipped,
                  children: item.children.map(flip),
                };
              },
            ),
          };
        });
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape varies
        queryClient.setQueriesData<any>(detailFilter, (old: any) =>
          old ? { ...old, isWatching: watching } : old,
        );
      },
      onError: (error) => {
        toast.error(`Failed to update watch state: ${error.message}`);
      },
      onSettled: (_data, _error, { ticketId }) => {
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
      },
    }),
  );
};

export const useAttachableChildren = (parentId: string) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.tracking.listAttachableChildren.queryOptions({ parentId }),
  );
};

export const useAttachChild = (parentId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.attachChild.mutationOptions({
      onMutate: async ({ childId }) => {
        const detailFilter = trpc.tracking.getOne.queryFilter({
          id: parentId,
        });
        const pickerFilter = trpc.tracking.listAttachableChildren.queryFilter({
          parentId,
        });
        await queryClient.cancelQueries(detailFilter);
        await queryClient.cancelQueries(pickerFilter);
        const previousDetail = queryClient.getQueriesData(detailFilter);
        const previousPicker = queryClient.getQueriesData(pickerFilter);

        // Look up the candidate in the picker cache so we can render a
        // best-effort row immediately. Missing fields (departments,
        // comment count) fill in on the post-mutation refetch.
        const candidate = previousPicker
          .flatMap(([, data]) => (Array.isArray(data) ? data : []))
          .find((c: { id: string }) => c.id === childId) as
          | {
              id: string;
              summary: string;
              status: string;
              parent?: { id: string } | null;
            }
          | undefined;
        // The child may be moving from another parent — capture it so we can
        // refresh that old parent's detail after the move.
        const oldParentId = candidate?.parent?.id ?? null;

        if (candidate) {
          // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape
          queryClient.setQueriesData<any>(detailFilter, (old: any) => {
            if (!old?.children) return old;
            return {
              ...old,
              children: [
                ...old.children,
                {
                  id: candidate.id,
                  summary: candidate.summary,
                  status: candidate.status,
                  departments: [],
                  _count: { comments: 0 },
                },
              ],
            };
          });
        }
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape
        queryClient.setQueriesData<any>(pickerFilter, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.filter((c: { id: string }) => c.id !== childId);
        });

        return { previousDetail, previousPicker, oldParentId };
      },
      onError: (error, _vars, context) => {
        for (const [key, data] of context?.previousDetail ?? []) {
          queryClient.setQueryData(key, data);
        }
        for (const [key, data] of context?.previousPicker ?? []) {
          queryClient.setQueryData(key, data);
        }
        toast.error(`Failed to attach sub-ticket: ${error.message}`);
      },
      onSuccess: () => {
        toast.success("Sub-ticket attached");
      },
      onSettled: (_data, _error, { childId }, context) => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: parentId }),
        );
        queryClient.invalidateQueries(
          trpc.tracking.listAttachableChildren.queryFilter({ parentId }),
        );
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        // The moved child's parent/breadcrumb changed; refresh its detail and
        // the old parent's detail (if it was reparented from elsewhere).
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: childId }),
        );
        if (context?.oldParentId) {
          queryClient.invalidateQueries(
            trpc.tracking.getOne.queryFilter({ id: context.oldParentId }),
          );
        }
      },
    }),
  );
};

export const useDetachChild = (parentId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.detachChild.mutationOptions({
      onMutate: async ({ ticketId }) => {
        const detailFilter = trpc.tracking.getOne.queryFilter({
          id: parentId,
        });
        await queryClient.cancelQueries(detailFilter);
        const previousDetail = queryClient.getQueriesData(detailFilter);
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape
        queryClient.setQueriesData<any>(detailFilter, (old: any) => {
          if (!old?.children) return old;
          return {
            ...old,
            children: old.children.filter(
              (c: { id: string }) => c.id !== ticketId,
            ),
          };
        });
        return { previousDetail };
      },
      onError: (error, _vars, context) => {
        if (context?.previousDetail) {
          for (const [key, data] of context.previousDetail) {
            queryClient.setQueryData(key, data);
          }
        }
        toast.error(`Failed to detach sub-ticket: ${error.message}`);
      },
      onSuccess: () => {
        toast.success("Sub-ticket detached");
      },
      onSettled: (_data, _error, { ticketId }) => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: parentId }),
        );
        queryClient.invalidateQueries(
          trpc.tracking.listAttachableChildren.queryFilter({ parentId }),
        );
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        // The detached child's parent is now null; refresh its detail too.
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
      },
    }),
  );
};

export const useAttachableAssets = (ticketId: string) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.tracking.listAttachableAssets.queryOptions({ ticketId }),
  );
};

export const useAttachAsset = (ticketId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.attachAsset.mutationOptions({
      onMutate: async ({ assetId }) => {
        const pickerFilter = trpc.tracking.listAttachableAssets.queryFilter({
          ticketId,
        });
        await queryClient.cancelQueries(pickerFilter);
        const previousPicker = queryClient.getQueriesData(pickerFilter);

        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape
        queryClient.setQueriesData<any>(pickerFilter, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.filter((c: { id: string }) => c.id !== assetId);
        });

        return { previousPicker };
      },
      onError: (error, _vars, context) => {
        for (const [key, data] of context?.previousPicker ?? []) {
          queryClient.setQueryData(key, data);
        }
        toast.error(`Failed to attach asset: ${error.message}`);
      },
      onSuccess: () => {
        toast.success("Asset attached");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
        queryClient.invalidateQueries(
          trpc.tracking.listAttachableAssets.queryFilter({ ticketId }),
        );
      },
    }),
  );
};

export const useDetachAsset = (ticketId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.detachAsset.mutationOptions({
      onMutate: async ({ assetId }) => {
        const detailFilter = trpc.tracking.getOne.queryFilter({
          id: ticketId,
        });
        await queryClient.cancelQueries(detailFilter);
        const previousDetail = queryClient.getQueriesData(detailFilter);
        // biome-ignore lint/suspicious/noExplicitAny: trpc cache shape
        queryClient.setQueriesData<any>(detailFilter, (old: any) => {
          if (!old?.assets) return old;
          return {
            ...old,
            assets: old.assets.filter(
              (at: { asset: { id: string } }) => at.asset.id !== assetId,
            ),
          };
        });
        return { previousDetail };
      },
      onError: (error, _vars, context) => {
        if (context?.previousDetail) {
          for (const [key, data] of context.previousDetail) {
            queryClient.setQueryData(key, data);
          }
        }
        toast.error(`Failed to detach asset: ${error.message}`);
      },
      onSuccess: () => {
        toast.success("Asset detached");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
        queryClient.invalidateQueries(
          trpc.tracking.listAttachableAssets.queryFilter({ ticketId }),
        );
      },
    }),
  );
};

export const useAddTicketComment = (ticketId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.addComment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to add comment: ${error.message}`);
      },
    }),
  );
};
