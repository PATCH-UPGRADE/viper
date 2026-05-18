"use client";

import { useCallback, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import {
  ChatProvider,
  useChatUI,
} from "@/features/chat/context/chat-panel-context";

const DEFAULT_WIDTH = 400;
const MAX_WIDTH = 800;

// split out inner component so it can consume ChatProvider
const LayoutInner = ({ children }: { children: React.ReactNode }) => {
  const { state } = useChatUI();

  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const isOpen = state !== "collapsed";

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    // keep functions inside callback to keep linter happy
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }

      const newWidth = window.innerWidth - e.clientX;
      setChatWidth(Math.min(MAX_WIDTH, Math.max(DEFAULT_WIDTH, newWidth)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-accent/20">{children}</SidebarInset>

      {isOpen && (
        <div
          className="relative flex-shrink-0 h-full"
          style={{ width: chatWidth }}
        >
          <button
            type="button"
            onMouseDown={onDragStart}
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize z-99
                       hover:bg-primary/40 active:bg-primary/60 transition-colors"
          />
          <ChatPanel />
        </div>
      )}
    </SidebarProvider>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => (
  <ChatProvider>
    <LayoutInner>{children}</LayoutInner>
  </ChatProvider>
);

export default Layout;
