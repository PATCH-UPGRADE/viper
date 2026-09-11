"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

export function ReportsSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    trpc.chat.getReportThreads.queryOptions({ limit: 50 }),
  );
  const reports = data.threads;

  const { mutateAsync: createReportThread, isPending } = useMutation(
    trpc.chat.createReportThread.mutationOptions(),
  );

  // Create the (empty) thread before navigating so it's in the sidebar
  // immediately, then go to it.
  const newReport = async () => {
    const id = crypto.randomUUID();
    await createReportThread({ threadId: id });
    // Only the sidebar list depends on this — refetch it in the background
    // instead of blocking the navigation the user is waiting on.
    void queryClient.invalidateQueries(trpc.chat.pathFilter());
    router.push(`/reports/${id}`);
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <Link href="/reports" className="text-sm font-semibold">
          Reports
        </Link>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={newReport}
        >
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {reports.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No reports yet. Start a conversation and ask VIPER to write one.
          </p>
        ) : (
          reports.map((r) => (
            <Link
              key={r.id}
              href={`/reports/${r.id}`}
              aria-current={
                pathname === `/reports/${r.id}` ? "page" : undefined
              }
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent"
            >
              <span className="line-clamp-2">
                {r.title || "Untitled report"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(r.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            </Link>
          ))
        )}
      </nav>
    </aside>
  );
}
