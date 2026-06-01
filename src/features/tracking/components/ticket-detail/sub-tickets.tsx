"use client";

import {
  AlertTriangleIcon,
  MessageSquareIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { getChipClass } from "@/features/tag-colors/palette";
import { cn } from "@/lib/utils";
import {
  useAttachableChildren,
  useAttachChild,
  useDetachChild,
} from "../../hooks/use-tracking";
import type { TicketDetail } from "../../types";
import { Section, statusHue, statusLabels } from "./shared";

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
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-2 text-xs",
                      getChipClass(statusHue[t.status]),
                    )}
                  >
                    {statusLabels[t.status]}
                  </Badge>
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
  children,
}: {
  parentId: string;
  children: SubTicketsChild[];
}) => {
  const detach = useDetachChild(parentId);

  return (
    <Section
      title="Sub-tickets"
      count={children.length > 0 ? children.length : undefined}
      trailing={<AttachChildPopover parentId={parentId} />}
    >
      {children.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <li key={child.id} className="flex items-center gap-2">
              <Link
                href={`/tracking/${child.id}`}
                className="flex-1 flex items-center justify-between gap-3 rounded-md border bg-background hover:bg-muted/50 transition px-3 py-2 min-w-0"
              >
                <span className="text-sm font-medium truncate">
                  {child.summary}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {child.departments.map((d) => (
                    <Badge
                      key={d.id}
                      variant="outline"
                      className={getChipClass(d.color)}
                    >
                      {d.name}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className={getChipClass(statusHue[child.status])}
                  >
                    {statusLabels[child.status]}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquareIcon className="size-3.5" />
                    {child._count.comments}
                  </span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="sm"
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
    </Section>
  );
};
