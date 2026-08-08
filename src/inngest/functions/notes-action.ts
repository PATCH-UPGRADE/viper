import "server-only";
import { actionNotesForRequest } from "@/features/notes/agent/noteAction";
import type { NoteActionSource } from "@/features/notes/agent/noteAction/context";
import { resolveNoteActionRequest } from "@/features/notes/server/note-action-requests";
import type { ChatNoteInput } from "@/features/notes/types";
import { inngest } from "../client";

const ACTION_EVENT = "note/action.requested" as const;

export async function requestNoteAction(
  source: NoteActionSource,
  refId: string,
  input?: ChatNoteInput,
): Promise<boolean> {
  try {
    await inngest.send({
      name: ACTION_EVENT,
      data: { source, refId, input, key: `${source}: ${refId}` },
    });
    return true;
  } catch (err) {
    console.error(`Failed to request note edit for ${source}: ${refId}`, err);
    return false;
  }
}

export const actionNotesFn = inngest.createFunction(
  {
    id: "action-notes",
    idempotency: "event.data.key",
    concurrency: { key: "event.data.source", limit: 1 },
  },
  {
    event: ACTION_EVENT,
  },
  async ({ event, step }) => {
    const { source, refId, input } = event.data as {
      source: NoteActionSource;
      refId: string;
      input?: ChatNoteInput;
    };

    const request = await step.run("resolve-note-request", () =>
      resolveNoteActionRequest(source, refId, input),
    );
    if (!request) return { skipped: true as const, source, refId };

    const summary = await step.run("action-notes", () =>
      actionNotesForRequest(request),
    );
    if (!summary) return { skipped: true as const, source, refId };

    return { source, refId, ...summary };
  },
);
