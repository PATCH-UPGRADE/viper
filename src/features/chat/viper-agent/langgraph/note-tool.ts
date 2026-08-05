import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveNoteTargetLabel } from "@/features/notes/server/note-targets";
import { ChatNoteInput } from "@/features/notes/types";
import { ScopeTargetModel } from "@/generated/prisma";
import { requestNoteAction } from "@/inngest/functions/notes-action";

// https://code.claude.com/docs/en/agent-sdk/custom-tools
export function makeRecordNoteTool(userId: string) {
  return tool(
    async ({ text, targetModel, instanceId }) => {
      const statement = text.trim();
      if (!statement) return "Text was empty";

      const targetLabel = await resolveNoteTargetLabel(targetModel, instanceId);
      if (!targetLabel) {
        return `No ${targetModel} exists with id ${instanceId}`;
      }

      const input: ChatNoteInput = {
        comment: statement,
        targetModel,
        instanceId,
        userId,
      };

      const queued = await requestNoteAction(
        "CHAT",
        crypto.randomUUID(),
        input,
      );
      if (!queued) {
        return `NOT RECORDED. Tell the user their note did not save and to try again in a momment. Do you claim you record anything.`;
      }

      return [
        `Queued for ${targetModel}.`,
        "The notes agent will compare this against the notes already on that target and may update an existing note instead of creating a new one.",
        "Do not call record_note again for this same fact. State in your reply what you recorded, so it stays on the record for later turn.",
      ].join(" ");
    },
    {
      name: "record_note",
      description: `Record a durable fact the user told you about, so it is available to staff and to every later AI run.
            Use this to record, correct, or retract information. A separate notes agent reads the notes that already exist on the target and decides whether to create a new note, update an existing one, or delete one.
            Record: fleet composition, configuration or exposure specifics, standing operational constraints, and corrections to how a device or vulnerability should be read going forward.
            Do NOT record transient chat: one off questions, what you just looked up, or your own analysis.
            Before calling, check the "notes" array already returned on that record by query_platform_data - if the fact is there, say so instead of recording it again.
            One atomic fact per call. Recording is asynchronous, so never tell the user a specific note was created, say you have recorded the fact.`,
      schema: z.object({
        text: z
          .string()
          .describe(
            "The fact to record, as a standalone statement. A reader six months from now must understand it with no other context: no 'the user said', no reference to this conversation.",
          ),
        targetModel: z
          .enum(ScopeTargetModel)
          .describe(
            "Which kind of record this is about. A fact covering every device of a make/model goes on DEVICE_GROUP_MATCHING, not on one ASSET.",
          ),
        instanceId: z
          .string()
          .describe(
            "The id of the record, taken from a query_platform_data result. Never invent one.",
          ),
      }),
    },
  );
}
