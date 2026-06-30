"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketCategory, TicketStatus } from "@/generated/prisma";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import {
  useAssignableUsers,
  useDepartments,
  useUpdateTicket,
} from "../../hooks/use-tracking";
import type { TicketDetail } from "../../types";
import { DepartmentMultiSelect } from "./department-multi-select";
import { categoryLabels, statusLabels } from "./shared";

const UNASSIGNED = "__unassigned__";

const toDateTimeLocal = (date: Date | string | null | undefined) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
};

type EditState = {
  summary: string;
  status: TicketStatus;
  category: TicketCategory;
  departmentIds: string[];
  // Keyed by departmentId so a department with no description yet still has a
  // tab to type into.
  descriptionsByDept: Record<string, string>;
  assigneeId: string;
  scheduledAt: string;
};

const buildEditState = (data: TicketDetail): EditState => ({
  summary: data.summary,
  status: data.status,
  category: data.category,
  departmentIds: data.departments.map((d) => d.id),
  descriptionsByDept: Object.fromEntries(
    data.descriptions.map((d) => [d.departmentId, d.body]),
  ),
  assigneeId: data.assignee?.id ?? UNASSIGNED,
  scheduledAt: toDateTimeLocal(data.scheduledAt),
});

const editStateFingerprint = (state: EditState) =>
  JSON.stringify({
    ...state,
    // Department order is incidental — toggling can re-order without semantic
    // change, so normalize before comparing.
    departmentIds: [...state.departmentIds].sort(),
    // Only the descriptions whose departments are still on the ticket
    // contribute to the saved state; ignore stragglers from removed depts.
    descriptionsByDept: Object.fromEntries(
      [...state.departmentIds]
        .sort()
        .map((id) => [id, (state.descriptionsByDept[id] ?? "").trim()]),
    ),
  });

export const TicketEditForm = ({
  data,
  onCancel,
}: {
  data: TicketDetail;
  onCancel: () => void;
}) => {
  // Snapshot the initial form state once so we can detect dirtiness against
  // the values the user originally opened the editor with, not against
  // whatever the latest server refetch produced.
  const [initial] = useState(() => buildEditState(data));
  const [form, setForm] = useState<EditState>(initial);
  const update = useUpdateTicket(data.id);
  const { data: users } = useAssignableUsers();
  const { data: departments } = useDepartments();

  const isDirty = editStateFingerprint(form) !== editStateFingerprint(initial);
  useBeforeUnload(isDirty);

  // Departments selected on the ticket — drives the description tabs. Look up
  // names/colors from either the loaded department list or the original
  // ticket payload so a tab still has a label even before the departments
  // query resolves.
  const departmentLookup = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string | null }
    >();
    for (const d of data.departments) map.set(d.id, d);
    for (const d of departments ?? []) map.set(d.id, d);
    return map;
  }, [data.departments, departments]);

  const selectedDepartments = form.departmentIds
    .map((id) => departmentLookup.get(id))
    .filter((d): d is { id: string; name: string; color: string | null } =>
      Boolean(d),
    );

  const handleCancel = () => {
    if (
      isDirty &&
      !window.confirm("Discard your unsaved changes to this ticket?")
    ) {
      return;
    }
    onCancel();
  };

  const handleSubmit = () => {
    const trimmedSummary = form.summary.trim();
    if (!trimmedSummary) return;
    const descriptions = form.departmentIds
      .map((id) => ({
        departmentId: id,
        body: (form.descriptionsByDept[id] ?? "").trim(),
      }))
      .filter((d) => d.body.length > 0);
    update.mutate(
      {
        id: data.id,
        summary: trimmedSummary,
        status: form.status,
        category: form.category,
        departmentIds: form.departmentIds,
        descriptions,
        assigneeId: form.assigneeId === UNASSIGNED ? null : form.assigneeId,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : null,
      },
      { onSuccess: () => onCancel() },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="rounded-lg border bg-background p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ticket-summary">Summary</Label>
          <Input
            id="ticket-summary"
            value={form.summary}
            onChange={(e) =>
              setForm((f) => ({ ...f, summary: e.target.value }))
            }
            required
            maxLength={255}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ticket-assignee">Assignee</Label>
            <Select
              value={form.assigneeId}
              onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))}
            >
              <SelectTrigger id="ticket-assignee">
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

          <div className="flex flex-col gap-2">
            <Label>Departments</Label>
            <DepartmentMultiSelect
              options={departments ?? []}
              selectedIds={form.departmentIds}
              onChange={(ids) => setForm((f) => ({ ...f, departmentIds: ids }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ticket-scheduled">Scheduled for</Label>
            <Input
              id="ticket-scheduled"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, scheduledAt: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ticket-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, category: v as TicketCategory }))
              }
            >
              <SelectTrigger id="ticket-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(categoryLabels) as TicketCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ticket-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: v as TicketStatus }))
              }
            >
              <SelectTrigger id="ticket-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(statusLabels) as TicketStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4 flex flex-col gap-2">
        <Label>Descriptions</Label>
        {selectedDepartments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a department above to write a description.
          </p>
        ) : (
          <Tabs defaultValue={selectedDepartments[0].id}>
            <TabsList variant="line">
              {selectedDepartments.map((d) => (
                <TabsTrigger key={d.id} value={d.id}>
                  <Badge variant="outline" className={getChipClass(d.color)}>
                    {d.name}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {selectedDepartments.map((d) => {
              const inputId = `ticket-description-${d.id}`;
              return (
                <TabsContent key={d.id} value={d.id} className="mt-3">
                  <Label htmlFor={inputId} className="sr-only">
                    {d.name} description
                  </Label>
                  <Textarea
                    id={inputId}
                    value={form.descriptionsByDept[d.id] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        descriptionsByDept: {
                          ...f.descriptionsByDept,
                          [d.id]: e.target.value,
                        },
                      }))
                    }
                    rows={6}
                    maxLength={10_000}
                    placeholder={`What does ${d.name} need to know about this ticket?`}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={update.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
