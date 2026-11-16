"use client";

import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import type { TicketDetail } from "../../types";
import { useReadOnly } from "./shared";

export const DescriptionCard = ({ data }: { data: TicketDetail }) => {
  const readOnly = useReadOnly();
  if (!data.body) return null;

  return (
    <CollapsibleSectionCard title="Description">
      <div className="text-sm">
        <MarkdownWithTablesWrapper plainLinks={readOnly}>
          {data.body}
        </MarkdownWithTablesWrapper>
      </div>
    </CollapsibleSectionCard>
  );
};
