"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useDeviceTypes = () => {
  const trpc = useTRPC();
  return useQuery(trpc.deviceTypes.getMany.queryOptions({}));
};
