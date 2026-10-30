"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export function DeviceQuestionAccordionItem({
  value,
  icon: Icon,
  title,
  deviceCount,
  subtitle,
  children,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  deviceCount?: number;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className="mb-3 overflow-hidden rounded-xl border last:border-b"
    >
      <AccordionTrigger className="items center rounded-none bg-secondary hover:bg-secondary/80 px-4 py-3 hover:no-underline dark:bg-background/20">
        <span className="flex items-start gap-2.5 text-left">
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span className="space-y-0.5">
            <span className="flex items-center gap-2 font-bold">
              {title}
              {deviceCount !== undefined && (
                <Badge
                  className="rounded-full border-primary/50 bg-primary/10 text-primary"
                  variant="outline"
                >
                  {deviceCount} {deviceCount === 1 ? "device" : "devices"}
                </Badge>
              )}
            </span>
            {subtitle && (
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
