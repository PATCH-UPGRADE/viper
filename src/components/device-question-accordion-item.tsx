"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function DeviceQuestionAccordionItem({
  value,
  icon: Icon,
  title,
  subtitle,
  showSubtitle = false,
  children,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  showSubtitle?: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-sm hover:no-underline">
        <span className="flex items-start gap-2.5 text-left">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="space-y-0.5">
            <span className="block">{title}</span>
            {showSubtitle && subtitle && (
              <span className="block text-xs font-normal">{subtitle}</span>
            )}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pl-[26px] text-sm">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
