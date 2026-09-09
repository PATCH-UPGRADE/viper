"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
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
  const { data } = useSuspenseQuery(
    trpc.chat.getReportThreads.queryOptions({ limit: 50 }),
  );
  const reports = data.threads;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <Link href="/reports" className="text-sm font-semibold">
          Reports
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/reports/${crypto.randomUUID()}`)}
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
