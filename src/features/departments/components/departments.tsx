"use client";

import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import {
  EntityContainer,
  EntityHeader,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/features/tag-colors/components/color-picker";
import {
  DEFAULT_HUE,
  getChipClass,
  type TagHue,
} from "@/features/tag-colors/palette";
import {
  useCreateDepartment,
  useRemoveDepartment,
  useSuspenseDepartments,
  useUpdateDepartment,
} from "../hooks/use-departments";

type DepartmentRow = ReturnType<typeof useSuspenseDepartments>["data"][number];

interface DepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DepartmentRow;
}

const DepartmentDialog = ({
  open,
  onOpenChange,
  initial,
}: DepartmentDialogProps) => {
  const isEditing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState<TagHue>(
    (initial?.color as TagHue | null) ?? DEFAULT_HUE,
  );

  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const pending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (isEditing) {
      await updateMutation.mutateAsync({
        id: initial.id,
        name,
        description: description || null,
        color,
      });
    } else {
      await createMutation.mutateAsync({
        name,
        description: description || null,
        color,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit department" : "New department"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-name">Name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Radiology"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-description">Description</Label>
            <Textarea
              id="dept-description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex items-center gap-3">
              <ColorPicker value={color} onChange={setColor} />
              <Badge variant="outline" className={getChipClass(color)}>
                {name || "Preview"}
              </Badge>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
            {isEditing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DepartmentsList = () => {
  const { data } = useSuspenseDepartments();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DepartmentRow | null>(
    null,
  );
  const removeMutation = useRemoveDepartment();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" /> New department
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No departments yet.
                </TableCell>
              </TableRow>
            ) : (
              data.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getChipClass(dept.color)}
                    >
                      {dept.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dept.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {dept._count.users}
                  </TableCell>
                  <TableCell className="text-right">
                    {dept._count.tickets}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditing(dept)}
                        aria-label="Edit department"
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPendingDelete(dept)}
                        aria-label="Delete department"
                      >
                        <TrashIcon className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DepartmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && (
        <DepartmentDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
        />
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Removes <strong>{pendingDelete.name}</strong>.{" "}
                  {pendingDelete._count.users > 0 ||
                  pendingDelete._count.tickets > 0
                    ? `${pendingDelete._count.users} user(s) and ${pendingDelete._count.tickets} ticket(s) will be unassigned.`
                    : "No users or tickets are linked."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                await removeMutation.mutateAsync({ id: pendingDelete.id });
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const DepartmentsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={
        <EntityHeader
          title="Departments"
          description="Manage the departments that own tickets and assignees."
        />
      }
    >
      {children}
    </EntityContainer>
  );
};

export const DepartmentsLoading = () => (
  <LoadingView message="Loading departments..." />
);
export const DepartmentsError = () => (
  <ErrorView message="Error loading departments" />
);
