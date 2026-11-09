"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface DrawerTab {
  value: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  content: ReactNode;
  /** When true, renders content directly without ScrollArea or padding wrapper. */
  rawContent?: boolean;
}

interface DashboardDrawerShellProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  tabs: DrawerTab[];
  children?: ReactNode;
}

// ============================================================================
// DashboardDrawerShell
// ============================================================================

export function DashboardDrawerShell({
  open,
  setOpen,
  title,
  description,
  tabs,
  children,
}: DashboardDrawerShellProps) {
  const isMobile = useIsMobile();

  return (
    <Drawer
      direction={isMobile ? "bottom" : "right"}
      open={open}
      onOpenChange={setOpen}
    >
      {children && <DrawerTrigger asChild>{children}</DrawerTrigger>}
      <DrawerContent className={isMobile ? "max-h-[85svh]" : "max-w-[70%]!"}>
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DrawerTitle className="text-xl">{title}</DrawerTitle>
              <DrawerDescription className="flex items-center gap-2">
                {description}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <Tabs
          defaultValue={tabs[0]?.value}
          className="flex flex-1 flex-col min-h-0"
        >
          <TabsList className="w-full justify-start rounded-none border-b bg-muted">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count !== undefined && (
                    <Badge variant="secondary">{tab.count}</Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="flex-1 m-0 overflow-hidden"
            >
              {tab.rawContent ? (
                tab.content
              ) : (
                // Radix lays the viewport's content out as a table, so a line that can't wrap (a
                // truncated description, a wide table) would widen the whole tab instead of
                // truncating or scrolling on its own. Lay it out as a block.
                <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:block!">
                  <div className="p-6">{tab.content}</div>
                </ScrollArea>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// Tab content building blocks
// ============================================================================

/** A tab's sections, stacked. */
export function DrawerSections({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-7">{children}</div>;
}

/**
 * A titled section of a tab. The title sticks while the section scrolls past. It is h-10, so
 * anything else sticky inside the section (an accordion header, say) should stick at top-10.
 */
export function DrawerSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Shown at the right of the title, e.g. a toggle. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="sticky top-0 z-20 mb-2 flex h-10 items-center justify-between gap-3 bg-background">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {description && (
        <p className="-mt-1 mb-2.5 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

/** Fields in up to three columns. */
export function DrawerFieldGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One labelled value. An empty value shows as a muted dash. */
export function DrawerField({
  label,
  children,
  className,
}: {
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const empty = children == null || children === "" || children === false;
  return (
    <div className={cn("min-w-0 text-sm", className)}>
      <div className="mb-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="break-words">
        {empty ? <span className="text-muted-foreground">—</span> : children}
      </div>
    </div>
  );
}
