"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useSuspenseSuggestedNotifications = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.overview.suggestedNotifications.queryOptions());
};

export const useSuspenseSuggestedWorkOrders = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.overview.suggestedWorkOrders.queryOptions());
};

export const useSuspenseRecentUpdates = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.overview.recentUpdates.queryOptions());
};
