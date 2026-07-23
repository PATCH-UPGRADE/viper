"use client";

import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function CollapsibleCard({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Card className={cn("gap-0", className)}>
      <Collapsible data-slot="collapsible-card" {...props} />
    </Card>
  );
}

function CollapsibleCardTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CardTitle>
      <CollapsibleTrigger
        data-slot="collapsible-card-trigger"
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2 rounded-md px-6 text-left outline-none",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      >
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
        {children}
      </CollapsibleTrigger>
    </CardTitle>
  );
}

function CollapsibleCardContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="collapsible-card-content"
      className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
      {...props}
    >
      <CardContent className={cn("pt-4", className)}>{children}</CardContent>
    </CollapsibleContent>
  );
}

export { CollapsibleCard, CollapsibleCardTrigger, CollapsibleCardContent };
