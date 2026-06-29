"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

export const useSuspenseDepartments = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.departments.getMany.queryOptions());
};

export const useCreateDepartment = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.departments.create.mutationOptions({
      onSuccess: () => {
        toast.success("Department created");
        queryClient.invalidateQueries(trpc.departments.getMany.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to create department: ${error.message}`);
      },
    }),
  );
};

export const useUpdateDepartment = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.departments.update.mutationOptions({
      onSuccess: () => {
        toast.success("Department updated");
        queryClient.invalidateQueries(trpc.departments.getMany.queryFilter());
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(trpc.tracking.getOne.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to update department: ${error.message}`);
      },
    }),
  );
};

export const useRemoveDepartment = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.departments.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Department removed");
        queryClient.invalidateQueries(trpc.departments.getMany.queryFilter());
        queryClient.invalidateQueries(trpc.tracking.getMany.queryFilter());
        queryClient.invalidateQueries(trpc.tracking.getOne.queryFilter());
      },
      onError: (error) => {
        toast.error(`Failed to remove department: ${error.message}`);
      },
    }),
  );
};
