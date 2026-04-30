"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarHeader } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { USER_ROLES, type UserRole } from "../utils";
import { AIChat } from "./chat";
import { useChat } from "./context";

export function ChatPanel() {
  const { state, toggleChatPanel } = useChat();
  const [userRole, setUserRole] = useState<UserRole>(USER_ROLES[0]);

  return (
    <div
      className={cn(
        "relative shrink-0 sticky top-0 h-svh overflow-hidden",
        "border-l bg-sidebar text-sidebar-foreground",
        state === "collapsed" ? "w-0 border-l-0" : "w-(--chat-panel-width)",
        "transition-[width] duration-200 ease-linear",
      )}
    >
      <div className="flex flex-col h-full w-(--chat-panel-width)">
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
          <AIChat userRole={userRole} onUserRoleChange={setUserRole} />
        </div>
      </div>
    </div>
  );
}
