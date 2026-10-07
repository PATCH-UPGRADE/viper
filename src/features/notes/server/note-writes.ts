import "server-only";
import type { NoteStatus, ScopeTargetModel } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";

export type NoteScope = {
  targetModel: ScopeTargetModel;
  instanceIds: string[];
  label?: string | null;
};

export class NoteNotFoundError extends Error {
  constructor(noteId: string) {
    super(`Note ${noteId} not found or already deleted`);
    this.name = "NoteNotFoundError";
  }
}

export async function createNote(
  tx: TransactionClient,
  args: {
    text: string;
    userId: string;
    status?: NoteStatus;
    scope?: NoteScope;
  },
): Promise<{ id: string; filterId: string | null }> {
  const { text, userId, status, scope } = args;
  const ids = scope?.instanceIds ?? [];
  const direct = scope && ids.length === 1 ? ids[0] : null;

  const note = await tx.note.create({
    data: {
      text,
      status,
      userId,
      ...(direct
        ? { targetModel: scope?.targetModel, instanceId: direct }
        : {}),
    },
    select: { id: true },
  });

  if (!scope || ids.length <= 1) return { id: note.id, filterId: null };

  const filter = await tx.entityFilter.create({
    data: {
      noteId: note.id,
      label: scope.label ?? null,
      targetModel: scope.targetModel,
      filter: { id: { in: ids } },
    },
    select: { id: true },
  });

  return { id: note.id, filterId: filter.id };
}

export async function updateNote(
  tx: TransactionClient,
  noteId: string,
  data: { text: string },
): Promise<void> {
  const { count } = await tx.note.updateMany({
    where: { id: noteId, deletedAt: null },
    data,
  });
  if (count === 0) throw new NoteNotFoundError(noteId);
}

export async function deleteNote(
  tx: TransactionClient,
  noteId: string,
): Promise<void> {
  const { count } = await tx.note.updateMany({
    where: { id: noteId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new NoteNotFoundError(noteId);
}
