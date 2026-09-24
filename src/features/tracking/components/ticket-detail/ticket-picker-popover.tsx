"use client";

import { PlusIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { TicketStatus } from "@/generated/prisma";
import { StatusChip } from "./shared";

export type TicketPickerCandidate = {
  id: string;
  summary: string;
  status: TicketStatus;
};

export const TicketPickerPopover = <T extends TicketPickerCandidate>({
  triggerLabel,
  candidates,
  onSelect,
  isPending,
  renderItemPrefix,
  renderItemMeta,
  searchKeywords,
  confirmWithReason = false,
}: {
  triggerLabel: string;
  candidates: T[] | undefined;
  // `reason` is null unless `confirmWithReason` is set and the user typed one.
  onSelect: (candidate: T, close: () => void, reason: string | null) => void;
  isPending: boolean;
  renderItemPrefix?: (candidate: T) => ReactNode;
  // Detail shown under the summary. A candidate that returns something here
  // gets a two-line row, so the summary keeps the full width.
  renderItemMeta?: (candidate: T) => ReactNode;
  // Extra terms the search box matches besides the summary, for anything
  // renderItemPrefix or renderItemMeta shows that the user can be expected
  // to type.
  searchKeywords?: (candidate: T) => string[];
  // Picking a ticket opens a second step with an optional reason field
  // instead of submitting at once.
  confirmWithReason?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<T | null>(null);
  const [reason, setReason] = useState("");

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setChosen(null);
      setReason("");
    }
  };
  const close = () => onOpenChange(false);

  const pick = (candidate: T) => {
    if (confirmWithReason) {
      setChosen(candidate);
      return;
    }
    onSelect(candidate, close, null);
  };

  const confirm = () => {
    if (!chosen) return;
    const trimmed = reason.trim();
    onSelect(chosen, close, trimmed.length > 0 ? trimmed : null);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon className="size-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="end">
        {chosen ? (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="truncate flex-1 font-medium">
                {chosen.summary}
              </span>
              <StatusChip status={chosen.status} className="text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-picker-reason">Reason (optional)</Label>
              <Textarea
                id="ticket-picker-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are these tickets related?"
                rows={3}
                maxLength={2000}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setChosen(null)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button size="sm" onClick={confirm} disabled={isPending}>
                {triggerLabel}
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search tickets..." />
            <CommandList>
              <CommandEmpty>No eligible tickets found.</CommandEmpty>
              <CommandGroup>
                {(candidates ?? []).map((t) => {
                  const meta = renderItemMeta?.(t);
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.id}
                      keywords={[t.summary, ...(searchKeywords?.(t) ?? [])]}
                      onSelect={() => pick(t)}
                      disabled={isPending}
                    >
                      {renderItemPrefix?.(t)}
                      {meta ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate">{t.summary}</span>
                          <span className="flex min-w-0 items-center gap-2">
                            {meta}
                            <StatusChip status={t.status} className="text-xs" />
                          </span>
                        </div>
                      ) : (
                        <>
                          <span className="truncate flex-1">{t.summary}</span>
                          <StatusChip
                            status={t.status}
                            className="ml-2 text-xs"
                          />
                        </>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};
