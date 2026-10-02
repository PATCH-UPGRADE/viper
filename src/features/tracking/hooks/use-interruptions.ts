"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// Not a suspense query: the server can't prefetch it (see prefetch.ts), and a
// suspense query would try to run during SSR without the user's session. The
// previous range stays on screen while the next one loads.
export const useInterruptionCalendar = (range: { from: Date; to: Date }) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.tracking.getInterruptionCalendar.queryOptions(range),
    placeholderData: keepPreviousData,
  });
};
