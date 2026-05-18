"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarHeader } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useChatUI } from "../context/chat-panel-context";
import {
  type SuggestedQuestion,
  SuggestedQuestionsProvider,
} from "../context/suggested-questions-context";
import { AIChat } from "./chat";

export function ChatPanel() {
  const { state, toggleChatPanel } = useChatUI();

  const suggestedQuestions: SuggestedQuestion[] = [
    {
      label: "Give me a recommendation",
      config: { agent: "giveRecommendations" },
    },
  ];

  return (
    <div
      className={cn(
        "relative shrink-0 sticky top-0 h-svh overflow-hidden",
        "border-l bg-sidebar text-sidebar-foreground",
        state === "collapsed" ? "w-0 border-l-0" : "w-full",
        "transition-[width] duration-200 ease-linear",
      )}
    >
      <div className="flex flex-col h-full w-full">
        <SidebarHeader className="flex-row items-center justify-between py-3">
          <span className="font-semibold text-sm">Ask VIPER</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleChatPanel}
          >
            <X className="size-4" />
            <span className="sr-only">Close chat panel</span>
          </Button>
        </SidebarHeader>
        <div className="flex flex-1 flex-col overflow-hidden">
          <SuggestedQuestionsProvider questions={suggestedQuestions}>
            <AIChat />
          </SuggestedQuestionsProvider>
        </div>
      </div>
    </div>
  );
}
