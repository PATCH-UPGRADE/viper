import "server-only";
import { z } from "zod";

export const noteActionOpSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  noteId: z.string().nullish(),
  text: z.string().nullish(),
  reason: z.string(),
});

export const noteActionSchema = z.object({
  ops: z.array(noteActionOpSchema),
});

export type NoteActionOp = {
  action: "create" | "update" | "delete";
  noteId?: string | null;
  text?: string | null;
  reason?: string;
};

export type NoteActionResult = { ops: NoteActionOp[] };
