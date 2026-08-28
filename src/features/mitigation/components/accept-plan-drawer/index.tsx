"use client";

import { SendIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAcceptMitigationPlan } from "../../hooks/use-mitigation";
import type { MitigationPlanWithWorkOrders } from "../../types";
import { BriefingPanel } from "./briefing-panel";
import {
  buildEdits,
  UNASSIGNED,
  type WorkOrderEdit,
  WorkOrderPanel,
} from "./work-order-panel";

export function AcceptPlanDrawer({
  plan,
  notificationId,
  open,
  onOpenChange,
}: {
  plan: MitigationPlanWithWorkOrders;
  notificationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const accept = useAcceptMitigationPlan(notificationId);

  const [edits, setEdits] = useState<WorkOrderEdit[]>(() =>
    buildEdits(plan.workOrders),
  );

  // Re-seed from the server payload every time the drawer opens so a cancelled
  // edit never leaks into the next review.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on open only
  useEffect(() => {
    if (open) setEdits(buildEdits(plan.workOrders));
  }, [open]);

  const isDirty =
    JSON.stringify(edits) !== JSON.stringify(buildEdits(plan.workOrders));
  useBeforeUnload(open && isDirty);

  const count = plan.workOrders.length;

  const patch = useCallback(
    (id: string, changes: Partial<WorkOrderEdit>) =>
      setEdits((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...changes } : e)),
      ),
    [],
  );

  const handleClose = () => {
    if (
      isDirty &&
      !window.confirm("Discard your unsaved changes to these work orders?")
    ) {
      return;
    }
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (edits.some((e) => e.summary.trim().length === 0)) return;
    try {
      await accept.mutateAsync({
        planId: plan.id,
        edits: edits.map((e) => ({
          id: e.id,
          summary: e.summary.trim(),
          body: e.body.trim() ? e.body : null,
          category: e.category,
          priority: e.priority,
          departmentIds: e.departmentIds,
          assigneeId: e.assigneeId === UNASSIGNED ? null : e.assigneeId,
        })),
      });
      onOpenChange(false);
    } catch {
      // surfaced via the mutation's onError toast
    }
  };

  return (
    <Drawer
      direction={isMobile ? "bottom" : "right"}
      open={open}
      // Escape / overlay clicks route through the same discard guard.
      onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
    >
      <DrawerContent className={isMobile ? "max-h-[90svh]" : "max-w-[42rem]!"}>
        <DrawerHeader className="border-b text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Accept plan #{plan.order + 1}
          </p>
          <DrawerTitle className="text-xl">{plan.title}</DrawerTitle>
          <DrawerDescription>
            Review and edit each draft. Nothing is created until you confirm.
          </DrawerDescription>
        </DrawerHeader>

        <Tabs defaultValue="workItems" className="min-h-0 flex-1 gap-0">
          <TabsList variant="line-primary" className="mx-4 mt-3 self-start">
            <TabsTrigger value="workItems">Work Items</TabsTrigger>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
          </TabsList>

          <TabsContent value="briefing" className="min-h-0 overflow-y-auto p-4">
            <BriefingPanel planId={plan.id} />
          </TabsContent>

          {/* forceMount preserves scroll position across tab switches. */}
          <TabsContent
            value="workItems"
            forceMount
            className="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <WorkOrderPanel
              edits={edits}
              workOrders={plan.workOrders}
              patch={patch}
            />
          </TabsContent>
        </Tabs>

        <DrawerFooter className="flex-row justify-end border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={accept.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              accept.isPending ||
              edits.some((e) => e.summary.trim().length === 0)
            }
          >
            <SendIcon className="size-4" />
            {accept.isPending
              ? "Creating..."
              : `Create ${count} work order${count === 1 ? "" : "s"}`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
