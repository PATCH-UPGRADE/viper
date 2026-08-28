"use client";

import { AlertTriangleIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAttachableChildren,
  useAttachChild,
  useDetachChild,
} from "../../hooks/use-tracking";
import type { TicketDetail } from "../../types";
import { CollapsibleSectionCard } from "./section-card";
import { StatusChip, TicketRefRow } from "./shared";

const AttachChildPopover = ({ parentId }: { parentId: string }) => {
  const [open, setOpen] = useState(false);
  const { data: candidates } = useAttachableChildren(parentId);
  const attach = useAttachChild(parentId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon className="size-3.5" />
          Add sub-ticket
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="end">
        <Command>
          <CommandInput placeholder="Search tickets..." />
          <CommandList>
            <CommandEmpty>No eligible tickets found.</CommandEmpty>
            <CommandGroup>
              {(candidates ?? []).map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.summary}
                  onSelect={() => {
                    attach.mutate(
                      { parentId, childId: t.id },
                      { onSuccess: () => setOpen(false) },
                    );
                  }}
                  disabled={attach.isPending}
                >
                  {t.parent && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangleIcon
                          aria-label={`Currently a child of ${t.parent.summary}`}
                          className="size-3.5 text-amber-500 shrink-0"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        Currently a child of {t.parent.summary}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <span className="truncate flex-1">{t.summary}</span>
                  <StatusChip status={t.status} className="ml-2 text-xs" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type SubTicketsChild = TicketDetail["children"][number];

export const SubTicketsSection = ({
  parentId,
  childTickets,
}: {
  parentId: string;
  childTickets: SubTicketsChild[];
}) => {
  const detach = useDetachChild(parentId);

  return (
    <CollapsibleSectionCard
      title="Sub-tickets"
      meta={childTickets.length}
      action={<AttachChildPopover parentId={parentId} />}
      defaultOpen={childTickets.length > 0}
    >
      {childTickets.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {childTickets.map((child) => (
            <TicketRefRow
              key={child.id}
              id={child.id}
              summary={child.summary}
              status={child.status}
              assigneeName={child.assignee?.name ?? null}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 size-7 -translate-y-1/2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={() => detach.mutate({ ticketId: child.id })}
                  disabled={detach.isPending}
                  aria-label={`Detach ${child.summary}`}
                >
                  <XIcon className="size-4" />
                </Button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No sub-tickets yet.</p>
      )}
    </CollapsibleSectionCard>
  );
};
