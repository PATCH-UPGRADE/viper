import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useIntegrationsParams } from "./use-integrations-params";

/**
 * Hook to fetch all vulnerabilities integrations using suspense
 */
export const useSuspenseIntegrations = () => {
  const trpc = useTRPC();
  const [params] = useIntegrationsParams();

  return useSuspenseQuery(trpc.vulnerabilities.getIntegrations.queryOptions(params));
};
