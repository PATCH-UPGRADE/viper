import { describe, expect, it } from "vitest";
import type { NoteActionContext } from "@/features/notes/agent/noteAction/context";
import { planNoteActions } from "@/features/notes/agent/noteAction/process_output";
import {
  type NoteActionResult,
  noteActionSchema,
} from "@/features/notes/agent/noteAction/schema";

function mockContext(candidateIds: string[]): NoteActionContext {
  return {
    request: {
      source: "MATCH_FEEDBACK",
      updatedText: "These pumps were discomissioned in Q3 2024",
      target: { targetModel: "DEVICE_GROUP_MATCHING", instanceId: "dgm_1" },
      targetLabel: "Acme InfusionPump (2.1.3)",
      userId: "user_1",
    },
    markdown: "## (some markdown)",
    candidates: candidateIds.map((cId) => ({
      id: cId,
      text: `existing ${cId}`,
    })),
  };
}

const noteActionPlan = (
  ops: NoteActionResult["ops"],
  candidates: string[] = ["note_a", "note_b"],
) => planNoteActions(mockContext(candidates), { ops });

describe("planNoteActions", () => {
  it("handles a responses with a create, an update and a delete", () => {
    expect(
      noteActionPlan([
        {
          action: "create",
          text: "Creating a note",
          reason: "new announcement",
        },
        {
          action: "update",
          noteId: "note_a",
          text: "Updating a note",
          reason: "revised announcement",
        },
        { action: "delete", noteId: "note_b" },
      ]),
    ).toEqual([
      { action: "create", text: "Creating a note" },
      { action: "update", noteId: "note_a", text: "Updating a note" },
      { action: "delete", noteId: "note_b" },
    ]);
  });
});
