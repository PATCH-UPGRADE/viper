import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  gatherNoteActionContext,
  type NoteActionContext,
  type NoteActionRequest,
  SYSTEM_PROMPT,
} from "./context";
import { applyNoteAction, type NoteActionSummary } from "./process_output";
import { type NoteActionResult, noteActionSchema } from "./schema";

const MODEL = "claude-haiku-4-5-20251001";

export async function draftNoteActions(
  context: NoteActionContext,
): Promise<NoteActionResult> {
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(noteActionSchema);

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);
}

export type NoteActionRunSummary = NoteActionSummary & { candidates: Number };

export async function actionNotesForRequest(
  request: NoteActionRequest,
): Promise<NoteActionRunSummary | null> {
  const context = await gatherNoteActionContext(request);
  if (!context) return null;

  const result = await draftNoteActions(context);
  const summary = await applyNoteAction(context, result);
  return { ...summary, candidates: context.candidates.length };
}
