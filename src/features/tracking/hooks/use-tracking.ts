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

export const useUpdateTicket = (ticketId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.tracking.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.tracking.getOne.queryFilter({ id: ticketId }),
        );
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        toast.success("Ticket updated");
      },
      onError: (error) => {
        toast.error(`Failed to update ticket: ${error.message}`);
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
