import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.emulators.getMany>;

/**
 * Prefetch all emulators
 */
export const prefetchEmulators = (params: Input) => {
  return prefetch(trpc.emulators.getMany.queryOptions(params));
};

/**
 * Prefetch a single emulator
 */
export const prefetchEmulator = (id: string) => {
  return prefetch(trpc.emulators.getOne.queryOptions({ id }));
};
