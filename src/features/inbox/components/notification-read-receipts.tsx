"use client";

import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/user-avatar";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";
import type { NotificationReadReceipt } from "../types";
import { groupReceiptsByDay } from "./shared";

/** Avatars shown in the trigger before the rest collapse into a "+N" chip. */
const VISIBLE_AVATARS = 3;

// The "+N" chip must match the avatars exactly, or the stack breaks visibly.
const STACK_ITEM = "-ml-2 size-7 shrink-0 ring-2 ring-background";
const STACK_FILL = "bg-accent text-[10px] text-accent-foreground";

type Props = {
  receipts: NotificationReadReceipt[];
  className?: string;
};

export function NotificationReadReceipts({ receipts, className }: Props) {
  if (receipts.length === 0) return null;

  const visible = receipts.slice(0, VISIBLE_AVATARS);
  const hiddenCount = receipts.length - visible.length;
  const groups = groupReceiptsByDay(receipts);

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {/* The pill is `bg-background`, not `bg-muted`: the avatar fallbacks
            are `bg-muted`, so a muted pill swallows them. */}
        <button
          type="button"
          className={cn(
            "flex cursor-default items-center gap-2 rounded-full border bg-background py-0.5 pr-2.5 pl-1",
            className,
          )}
        >
          <span className="flex items-center">
            {visible.map((receipt) => (
              <Avatar key={receipt.id} className={cn(STACK_ITEM, "first:ml-0")}>
                {receipt.user.image && (
                  <AvatarImage
                    src={receipt.user.image}
                    alt={receipt.user.name.trim() || "User avatar"}
                  />
                )}
                {/* One letter, not two: the overlap would clip the second. */}
                <AvatarFallback className={STACK_FILL}>
                  {initialsOf(receipt.user.name).charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
            {hiddenCount > 0 && (
              // `relative` keeps this above the avatars, which are positioned.
              <span
                className={cn(
                  STACK_ITEM,
                  STACK_FILL,
                  "relative flex items-center justify-center rounded-full",
                )}
              >
                +{hiddenCount}
              </span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {receipts.length} read
          </span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2.5 text-sm font-medium">
          Opened by {receipts.length}{" "}
          {receipts.length === 1 ? "person" : "people"}
        </p>
        <ScrollArea
          type="always"
          className="[&>[data-slot=scroll-area-viewport]]:max-h-72"
        >
          <div className="flex flex-col gap-3 p-3">
            {groups.map((group) => (
              <div key={group.dayStart} className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.receipts.map((receipt) => (
                  <div key={receipt.id} className="flex items-center gap-2">
                    <UserAvatar
                      user={receipt.user}
                      className="size-7 shrink-0 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {receipt.user.name}
                      </p>
                      {receipt.user.department && (
                        <p className="truncate text-xs text-muted-foreground">
                          {receipt.user.department.name}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(receipt.readAt, "h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </HoverCardContent>
    </HoverCard>
  );
}
