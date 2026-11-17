import "server-only";
import { prefetch, trpc } from "@/trpc/server";

/**
 * Prefetch all integrations
 */
export const prefetchIntegrations = () => {
  return prefetch(trpc.integrations.getMany.queryOptions());
};

export const prefetchIntegrationSuggestions = () => {
  return prefetch(trpc.integrations.getSuggestions.queryOptions());
};
