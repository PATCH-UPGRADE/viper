"use client";

import {
  AlertTriangleIcon,
  PlusIcon,
  SquareCheckBigIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
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
import { StatusChip } from "./shared";

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
            <li
              key={child.id}
              className="group relative flex items-center py-2.5"
            >
              <Link
                href={`/tracking/${child.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 transition-[padding] group-hover:pr-8"
              >
                <SquareCheckBigIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
                  {child.summary}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {child.assignee?.name ?? "Unassigned"}
                  </span>
                  <StatusChip status={child.status} />
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-1/2 size-7 -translate-y-1/2 opacity-0 transition group-hover:opacity-100"
                onClick={() => detach.mutate({ ticketId: child.id })}
                disabled={detach.isPending}
                aria-label={`Detach ${child.summary}`}
              >
                <XIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No sub-tickets yet.</p>
      )}
    </CollapsibleSectionCard>
  );
};
