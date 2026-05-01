"use client";

import React from "react";
import { USER_ROLES, type UserRole } from "../utils";

type ChatContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
};

const ChatContext = React.createContext<ChatContextProps | null>(null);

export function useChatUI() {
  const context = React.useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider.");
  }
  return context;
}

const CHAT_PANEL_WIDTH = "400px";

export function ChatProvider({
  defaultOpen = false,
  open: openProp,
  onOpenChange: setOpenProp,
  children,
}: React.PropsWithChildren<{
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}>) {
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const [userRole, setUserRole] = React.useState<UserRole>(USER_ROLES[0]);

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
    },
    [setOpenProp, open],
  );

  const toggleChatPanel = React.useCallback(() => {
    return setOpen((open) => !open);
  }, [setOpen]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<ChatContextProps>(
    () => ({ state, open, setOpen, toggleChatPanel, userRole, setUserRole }),
    [state, open, setOpen, toggleChatPanel, userRole],
  );

  return (
    <ChatContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--chat-panel-width": CHAT_PANEL_WIDTH,
          } as React.CSSProperties
        }
        className="group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full"
      >
        {children}
      </div>
    </ChatContext.Provider>
  );
}
