"use client";

import { LinkIcon, XIcon } from "lucide-react";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import {
  useLinkableTickets,
  useLinkTicket,
  useUnlinkTicket,
} from "../../hooks/use-tracking";
import type { RelatedTicketLink } from "../../types";
import { DepartmentChips, RowHoverAction, TicketRefRow } from "./shared";
import { TicketPickerPopover } from "./ticket-picker-popover";

const ExternalId = ({ externalId }: { externalId: string | undefined }) =>
  externalId ? (
    <span className="shrink-0 font-mono text-xs text-primary">
      {externalId}
    </span>
  ) : null;

const LinkTicketPopover = ({ ticketId }: { ticketId: string }) => {
  const { data: candidates } = useLinkableTickets(ticketId);
  const link = useLinkTicket();

  return (
    <TicketPickerPopover
      triggerLabel="Link ticket"
      candidates={candidates}
      isPending={link.isPending}
      onSelect={(t, close, reason) =>
        link.mutate(
          { ticketId, relatedTicketId: t.id, reason },
          { onSuccess: close },
        )
      }
      confirmWithReason
      renderItemPrefix={(t) => (
        <ExternalId externalId={t.externalMappings[0]?.externalId} />
      )}
      searchKeywords={(t) => t.externalMappings.map((m) => m.externalId)}
    />
  );
};

const RelatedTicketRow = ({
  link,
  onUnlink,
  isPending,
}: {
  link: RelatedTicketLink;
  onUnlink: () => void;
  isPending: boolean;
}) => {
  const { ticket, reason } = link;
  const hasDetails = ticket.departments.length > 0 || reason;

  return (
    <TicketRefRow
      id={ticket.id}
      summary={ticket.summary}
      status={ticket.status}
      icon={<LinkIcon className="size-4 shrink-0 text-muted-foreground" />}
      leading={
        <ExternalId externalId={ticket.externalMappings[0]?.externalId} />
      }
      details={
        hasDetails && (
          <>
            {ticket.departments.length > 0 && (
              <DepartmentChips departments={ticket.departments} />
            )}
            {reason && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {reason}
              </span>
            )}
          </>
        )
      }
      action={
        <RowHoverAction
          label={`Unlink ${ticket.summary}`}
          onClick={onUnlink}
          disabled={isPending}
        >
          <XIcon className="size-4" />
        </RowHoverAction>
      }
    />
  );
};

export const RelatedTicketsSection = ({
  ticketId,
  relatedTickets,
}: {
  ticketId: string;
  relatedTickets: RelatedTicketLink[];
}) => {
  const unlink = useUnlinkTicket();

  return (
    <CollapsibleSectionCard
      title="Related tickets"
      meta={`(${relatedTickets.length})`}
      action={<LinkTicketPopover ticketId={ticketId} />}
      defaultOpen={false}
    >
      {relatedTickets.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {relatedTickets.map((link) => (
            <RelatedTicketRow
              key={link.linkId}
              link={link}
              onUnlink={() => unlink.mutate({ linkId: link.linkId })}
              isPending={unlink.isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No related tickets yet.</p>
      )}
    </CollapsibleSectionCard>
  );
};
