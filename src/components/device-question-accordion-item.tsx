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
    <AccordionItem
      value={value}
      className="mb-3 overflow-hidden rounded-xl border last:border-b"
    >
      <AccordionTrigger className="items-center rounded-none bg-secondary hover:bg-secondary/80 px-4 py-3 hover:no-underline dark:bg-background/20">
        <span className="flex items-start gap-2.5 text-left">
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span className="space-y-0.5">
            <span className="block font-bold">{title}</span>
            {showSubtitle && subtitle && (
              <span className="block text-xs font-normal text-muted-foreground">
                {subtitle}
              </span>
            )}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="bg-card px-6 pt-5 pb-5 dark:bg-accent/40">
        <div className="max-w-prose">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
