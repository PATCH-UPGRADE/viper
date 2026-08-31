import { memo } from "react";
import { PriorityBadge } from "@/components/priority-badge";
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
import type { PlanWorkOrder } from "../../types";

export const UNASSIGNED = "__unassigned__";

export type WorkOrderEdit = {
  id: string;
  summary: string;
  body: string;
  category: TicketCategory;
  priority: Priority;
  departmentIds: string[];
  assigneeId: string;
};

export const buildEdit = (workOrder: PlanWorkOrder): WorkOrderEdit => ({
  id: workOrder.id,
  summary: workOrder.summary,
  body: workOrder.body ?? "",
  category: workOrder.category,
  priority: workOrder.priority,
  departmentIds: workOrder.departments.map((d) => d.id),
  assigneeId: workOrder.assignee?.id ?? UNASSIGNED,
});

export const buildEdits = (workOrders: PlanWorkOrder[]): WorkOrderEdit[] =>
  workOrders.map(buildEdit);

export function WorkOrderPanel({
  edits,
  workOrders,
  patch,
}: {
  edits: WorkOrderEdit[];
  workOrders: PlanWorkOrder[];
  patch: (id: string, changes: Partial<WorkOrderEdit>) => void;
}) {
  const { data: users } = useAssignableUsers();
  const { data: departments } = useDepartments();
  const count = edits.length;

  return (
    <ScrollArea className="h-full bg-muted">
      <div className="flex flex-col gap-4 p-4">
        {edits.map((edit, index) => (
          <WorkOrderEditCard
            key={edit.id}
            edit={edit}
            workOrder={workOrders[index]}
            index={index}
            count={count}
            patch={patch}
            departments={departments}
            users={users}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

const WorkOrderEditCard = memo(function WorkOrderEditCard({
  edit,
  workOrder,
  index,
  count,
  patch,
  departments,
  users,
}: {
  edit: WorkOrderEdit;
  workOrder: PlanWorkOrder | undefined;
  index: number;
  count: number;
  patch: (id: string, changes: Partial<WorkOrderEdit>) => void;
  departments: ReturnType<typeof useDepartments>["data"];
  users: ReturnType<typeof useAssignableUsers>["data"];
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {workOrder?.sourceLabel ?? "Work order"}
          </span>
          <span className="text-xs text-muted-foreground">
            {workOrder?.suggestedAssignee ?? "Draft — not yet created"}
          </span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {index + 1}/{count}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`wo-summary-${edit.id}`}>Short description</Label>
        <Input
          id={`wo-summary-${edit.id}`}
          value={edit.summary}
          onChange={(e) => patch(edit.id, { summary: e.target.value })}
          required
          maxLength={255}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`wo-body-${edit.id}`}>Detailed description</Label>
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
              {(Object.keys(categoryLabels) as TicketCategory[]).map((c) => (
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
            onValueChange={(v) => patch(edit.id, { priority: v as Priority })}
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
            onChange={(ids) => patch(edit.id, { departmentIds: ids })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`wo-assignee-${edit.id}`}>Assigned to</Label>
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
});
