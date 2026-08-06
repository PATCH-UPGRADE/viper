"use client";

import type React from "react";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardTrigger,
} from "@/components/ui/collapsible-card";
import { cn } from "@/lib/utils";

export const CollapsibleSectionCard = ({
  title,
  meta,
  action,
  defaultOpen = true,
  contentClassName,
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
}) => (
  <CollapsibleCard defaultOpen={defaultOpen} className="gap-0 py-0">
    <div className="flex items-center gap-2 pr-5">
      <CollapsibleCardTrigger className="px-5 py-4">
        <span className="text-base font-semibold">{title}</span>
        {meta != null && (
          <span className="text-sm font-normal text-muted-foreground">
            {meta}
          </span>
        )}
      </CollapsibleCardTrigger>
      {action && <div className="ml-auto pl-2">{action}</div>}
    </div>
    <CollapsibleCardContent className={cn("px-5 pt-1 pb-5", contentClassName)}>
      {children}
    </CollapsibleCardContent>
  </CollapsibleCard>
);
