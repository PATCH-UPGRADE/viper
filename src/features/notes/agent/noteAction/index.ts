import "server-only";
import { createChatModel } from "@/lib/llm/chat-model";
import {
  gatherNoteActionContext,
  type NoteActionContext,
  type NoteActionRequest,
  SYSTEM_PROMPT,
} from "./context";
import { applyNoteAction, type NoteActionSummary } from "./process_output";
import { type NoteActionResult, noteActionSchema } from "./schema";

export async function draftNoteActions(
  context: NoteActionContext,
): Promise<NoteActionResult> {
  const model = createChatModel("notes.action").withStructuredOutput(
    noteActionSchema,
    { method: "functionCalling" },
  );

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);
}

export type NoteActionRunSummary = NoteActionSummary & { candidates: number };

export async function actionNotesForRequest(
  request: NoteActionRequest,
): Promise<NoteActionRunSummary | null> {
  const context = await gatherNoteActionContext(request);
  if (!context) return null;

  const result = await draftNoteActions(context);
  const summary = await applyNoteAction(context, result);
  return { ...summary, candidates: context.candidates.length };
}
