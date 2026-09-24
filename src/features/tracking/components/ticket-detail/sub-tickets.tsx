"use client";

import { AlertTriangleIcon, XIcon } from "lucide-react";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
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
import { RowHoverAction, TicketRefRow } from "./shared";
import { TicketPickerPopover } from "./ticket-picker-popover";

const AttachChildPopover = ({ parentId }: { parentId: string }) => {
  const { data: candidates } = useAttachableChildren(parentId);
  const attach = useAttachChild(parentId);

  return (
    <TicketPickerPopover
      triggerLabel="Add sub-ticket"
      candidates={candidates}
      isPending={attach.isPending}
      onSelect={(t, close) =>
        attach.mutate({ parentId, childId: t.id }, { onSuccess: close })
      }
      renderItemPrefix={(t) =>
        t.parent && (
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
        )
      }
    />
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
                <RowHoverAction
                  label={`Detach ${child.summary}`}
                  onClick={() => detach.mutate({ ticketId: child.id })}
                  disabled={detach.isPending}
                >
                  <XIcon className="size-4" />
                </RowHoverAction>
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
