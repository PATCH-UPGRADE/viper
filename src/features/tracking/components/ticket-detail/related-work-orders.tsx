import { SquareCheckBigIcon } from "lucide-react";
import Link from "next/link";
import type { TicketDetail } from "../../types";
import { CollapsibleSectionCard } from "./section-card";
import { StatusChip } from "./shared";

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
          <li key={wo.id} className="flex items-center py-2.5">
            <Link
              href={`/tracking/${wo.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
            >
              <SquareCheckBigIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {wo.summary}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {wo.assignee?.name ?? "Unassigned"}
                </span>
                <StatusChip status={wo.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </CollapsibleSectionCard>
  );
};
