"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileTextIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

export function ReportsLanding() {
  const router = useRouter();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.chat.getManyThreads.queryOptions({ limit: 50, withReport: true }),
  );
  const reports = data.threads;

  return (
    <div className="flex min-w-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-semibold">Reports</span>
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
                className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="line-clamp-2">
                  {r.title || "Untitled report"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {new Date(r.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            ))
          )}
        </nav>
      </aside>

      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <FileTextIcon className="size-4" />
        Select a report, or start a new conversation.
      </div>
    </div>
  );
}
