import type { TicketDetail } from "../../types";
import { CollapsibleSectionCard } from "./section-card";
import { TicketRefRow } from "./shared";

type Sibling = NonNullable<
  TicketDetail["mitigationPlan"]
>["workOrders"][number];

export const RelatedWorkOrdersSection = ({
  ticketId,
  siblings,
}: {
  ticketId: string;
  siblings: Sibling[];
}) => {
  const related = siblings.filter((s) => s.id !== ticketId);
  if (related.length === 0) return null;

  return (
    <CollapsibleSectionCard title="Related work orders" meta={related.length}>
      <ul className="flex flex-col divide-y">
        {related.map((wo) => (
          <TicketRefRow
            key={wo.id}
            id={wo.id}
            summary={wo.summary}
            status={wo.status}
            assigneeName={wo.assignee?.name ?? null}
          />
        ))}
      </ul>
    </CollapsibleSectionCard>
  );
};
