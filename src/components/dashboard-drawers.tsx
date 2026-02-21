"use client";

import type { LucideIcon } from "lucide-react";
import { MessageSquare } from "lucide-react";
import { Fragment } from "react";
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

// ============================================================================
// Types
// ============================================================================

export interface DrawerTab {
  value: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  content: React.ReactNode;
}

export interface InfoColumnSection {
  header: string;
  items: Array<{ header: string; content: React.ReactNode }>;
}

interface DashboardDrawerShellProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  tabs: DrawerTab[];
  infoColumn: React.ReactNode;
  children?: React.ReactNode;
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
  infoColumn,
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

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={30}>
            <Tabs
              defaultValue={tabs[0]?.value}
              className="flex flex-col h-full"
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
                  className="flex-1 m-0"
                >
                  <ScrollArea className="h-full">
                    <div className="p-6">{tab.content}</div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={40} minSize={25}>
            {infoColumn}
          </ResizablePanel>
        </ResizablePanelGroup>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// AIChatSection
// ============================================================================

// TODO: expand when committing to this design
export function AIChatSection() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <div className="text-center space-y-2">
        <MessageSquare className="h-12 w-12 mx-auto opacity-50" />
        <p className="text-sm">AI Chat coming soon</p>
      </div>
    </div>
  );
}

// ============================================================================
// InfoColumn
// ============================================================================

export function InfoColumn({ sections }: { sections: InfoColumnSection[] }) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-4 text-sm">
        {sections.map((section, i) => (
          <Fragment key={`${i}-${section.header}`}>
            {i > 0 && <Separator />}
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold sticky top-0 bg-background">{section.header}</h3>
              <div className="grid grid-cols-1 gap-3">
                {section.items.map(({ header, content }) => (
                  <div key={header}>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {header}
                    </div>
                    {content}
                  </div>
                ))}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </ScrollArea>
  );
}
