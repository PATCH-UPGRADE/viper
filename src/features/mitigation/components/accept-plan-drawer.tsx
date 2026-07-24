"use client";

import { SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PriorityBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DepartmentMultiSelect } from "@/features/tracking/components/ticket-detail/department-multi-select";
import {
  CategoryChip,
  categoryLabels,
} from "@/features/tracking/components/ticket-detail/shared";
import {
  useAssignableUsers,
  useDepartments,
} from "@/features/tracking/hooks/use-tracking";
import { Priority, type TicketCategory } from "@/generated/prisma";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAcceptMitigationPlan } from "../hooks/use-mitigation";
import type { MitigationPlanWithWorkOrders, PlanWorkOrder } from "../types";

const UNASSIGNED = "__unassigned__";

type WorkOrderEdit = {
  id: string;
  summary: string;
  body: string;
  category: TicketCategory;
  priority: Priority;
  departmentIds: string[];
  assigneeId: string;
};

const buildEdit = (workOrder: PlanWorkOrder): WorkOrderEdit => ({
  id: workOrder.id,
  summary: workOrder.summary,
  body: workOrder.body ?? "",
  category: workOrder.category,
  priority: workOrder.priority,
  departmentIds: workOrder.departments.map((d) => d.id),
  assigneeId: workOrder.assignee?.id ?? UNASSIGNED,
});

const buildEdits = (workOrders: PlanWorkOrder[]): WorkOrderEdit[] =>
  workOrders.map(buildEdit);

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
  const { data: users } = useAssignableUsers();
  const { data: departments } = useDepartments();

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

  const patch = (id: string, changes: Partial<WorkOrderEdit>) =>
    setEdits((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...changes } : e)),
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

        <ScrollArea className="min-h-0 flex-1 bg-muted">
          <div className="flex flex-col gap-4 p-4">
            {edits.map((edit, index) => {
              const workOrder = plan.workOrders[index];
              return (
                <div
                  key={edit.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">
                        {workOrder?.sourceLabel ?? "Work order"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {workOrder?.suggestedAssignee ??
                          "Draft — not yet created"}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {index + 1}/{count}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`wo-summary-${edit.id}`}>
                      Short description
                    </Label>
                    <Input
                      id={`wo-summary-${edit.id}`}
                      value={edit.summary}
                      onChange={(e) =>
                        patch(edit.id, { summary: e.target.value })
                      }
                      required
                      maxLength={255}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`wo-body-${edit.id}`}>
                      Detailed description
                    </Label>
                    <Textarea
                      id={`wo-body-${edit.id}`}
                      value={edit.body}
                      onChange={(e) => patch(edit.id, { body: e.target.value })}
                      rows={6}
                      maxLength={10_000}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`wo-category-${edit.id}`}>Category</Label>
                      <Select
                        value={edit.category}
                        onValueChange={(v) =>
                          patch(edit.id, { category: v as TicketCategory })
                        }
                      >
                        <SelectTrigger id={`wo-category-${edit.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(categoryLabels) as TicketCategory[]
                          ).map((c) => (
                            <SelectItem key={c} value={c}>
                              <CategoryChip category={c} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`wo-priority-${edit.id}`}>Priority</Label>
                      <Select
                        value={edit.priority}
                        onValueChange={(v) =>
                          patch(edit.id, { priority: v as Priority })
                        }
                      >
                        <SelectTrigger id={`wo-priority-${edit.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(Priority).map((p) => (
                            <SelectItem key={p} value={p}>
                              <PriorityBadge priority={p} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Team</Label>
                      <DepartmentMultiSelect
                        options={departments ?? []}
                        selectedIds={edit.departmentIds}
                        onChange={(ids) =>
                          patch(edit.id, { departmentIds: ids })
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`wo-assignee-${edit.id}`}>
                        Assigned to
                      </Label>
                      <Select
                        value={edit.assigneeId}
                        onValueChange={(v) => patch(edit.id, { assigneeId: v })}
                      >
                        <SelectTrigger id={`wo-assignee-${edit.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {users?.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name ?? u.email ?? u.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

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
