import "server-only";
import prisma from "@/lib/db";
import type { NoteActionContext } from "./context";
import type { NoteActionOp, NoteActionResult } from "./schema";

export type NoteActionWrite =
  | { action: "create"; text: string }
  | { action: "update"; noteId: string; text: string }
  | { action: "delete"; noteId: string; text?: string };

export type NoteActionSummary = {
  created: number;
  updated: number;
  deleted: number;
};

function planOneAction(
  op: NoteActionOp,
  candidateIds: Set<string>,
): NoteActionWrite | null {
  const text = (op.text ?? "").trim();

  if (op.action === "create") {
    return text ? { action: "create", text } : null;
  }

  const noteId = op.noteId;
  if (!noteId || !candidateIds.has(noteId)) return null;

  if (op.action === "update") {
    return text ? { action: "update", noteId, text } : null;
  }

  return { action: "delete", noteId };
}

export function planNoteActions(
  context: NoteActionContext,
  result: NoteActionResult,
): NoteActionWrite[] {
  const candidateIds = new Set(context.candidates.map((cc) => cc.id));
  const claimed = new Set<string>();
  const writes: NoteActionWrite[] = [];

  if (!result.ops) return [];
  for (const op of result.ops) {
    const write = planOneAction(op, candidateIds);
    if (!write) continue;

    if (write.action !== "create") {
      if (claimed.has(write.noteId)) continue;
      claimed.add(write.noteId);
    }

    writes.push(write);
  }

  return writes;
}

export async function applyNoteAction(
  context: NoteActionContext,
  result: NoteActionResult,
): Promise<NoteActionSummary> {
  const writes = planNoteActions(context, result);
  const { target, userId } = context.request;

  const summary: NoteActionSummary = {
    created: 0,
    updated: 0,
    deleted: 0,
  };

  if (writes.length === 0) return summary;

  await prisma.$transaction(async (tx) => {
    for (const write of writes) {
      if (write.action === "create") {
        await tx.note.create({
          data: {
            text: write.text,
            status: "SCOPED",
            userId,
            targetModel: target.targetModel,
            instanceId: target.instanceId,
          },
        });
        summary.created++;
        continue;
      }
      if (write.action === "update") {
        await tx.note.update({
          where: { id: write.noteId },
          data: { text: write.text },
        });
        summary.updated++;
        continue;
      }

      await tx.note.update({
        where: { id: write.noteId },
        data: { deletedAt: new Date() },
      });
      summary.deleted++;
    }
  });

  return summary;
}
