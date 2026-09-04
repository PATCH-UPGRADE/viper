"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, FileDownIcon } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { AIChat } from "@/features/chat/components/chat";
import { useTRPC } from "@/trpc/client";

const EXPORTS = [
  ["pdf", "PDF"],
  ["docx", "Word"],
] as const;

export function ReportDetail({ chatId }: { chatId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, refetch } = useSuspenseQuery(
    trpc.chat.getReportThread.queryOptions({ threadId: chatId }),
  );

  const onTurnEnd = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries(
      trpc.chat.getReportThreads.queryFilter(),
    );
  }, [refetch, queryClient, trpc.chat.getReportThreads]);

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex w-[400px] shrink-0 flex-col border-r">
        {/* Remount on chatId change instead of syncing it into chat state. */}
        <AIChat
          key={chatId}
          controlledThreadId={chatId}
          onTurnEnd={onTurnEnd}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b p-3">
          <Link
            href="/reports"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" />
            Reports
          </Link>
          <div className="flex gap-2">
            {EXPORTS.map(([format, label]) => (
              <Button
                key={format}
                variant="outline"
                size="sm"
                asChild
                disabled={!data.report}
              >
                <a
                  href={`/api/reports/${chatId}/export?format=${format}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileDownIcon className="size-4" />
                  {label}
                </a>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {data.report ? (
            <MarkdownWithTablesWrapper>{data.report}</MarkdownWithTablesWrapper>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              The report will appear here once VIPER writes one. Ask for a
              report, briefing, or write-up in the conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
