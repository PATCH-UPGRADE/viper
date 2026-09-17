import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  type DeviceGroupMatchingIdentity,
  findDeviceGroupMatching,
  resolveNoteTargetLabel,
} from "@/features/notes/server/note-targets";
import type { ChatNoteInput } from "@/features/notes/types";
import { ScopeTargetModel } from "@/generated/prisma";
import { requestNoteAction } from "@/inngest/functions/notes-action";

function deviceGroupMatchingKey(identity: DeviceGroupMatchingIdentity): string {
  return JSON.stringify([
    identity.manufacturerName.trim().toLocaleLowerCase(),
    identity.productName?.trim().toLowerCase() || null,
    identity.version?.trim().toLowerCase() || null,
    identity.versionRange?.trim() || null,
  ]);
}

export function makeRecordNoteTool(userId: string) {
  return tool(
    async ({ text, targetModel, instanceId, deviceGroupMatching, create }) => {
      const statement = text.trim();
      if (!statement) return "Text was empty";
      let targetId = instanceId ?? null;

      if (targetModel === "DEVICE_GROUP_MATCHING" && deviceGroupMatching) {
        const lookup = await findDeviceGroupMatching(deviceGroupMatching, {
          create: create === true,
        });
        if (!lookup.found) {
          return JSON.stringify({
            error:
              "No device group matching found. Nothing was recorded, so do not tell the user you recorded this. Run again with one of relatedMatchings as deviceGroupMatching to use an existing matching, or run again with create: true to create a new device group matching.",
            relatedMatchings: lookup.relatedMatchings,
          });
        }
        targetId = lookup.id;
      }
      if (!targetId) {
        return "instanceId is required. Nothing was recorded";
      }
      const targetLabel = await resolveNoteTargetLabel(targetModel, targetId);
      if (!targetLabel) {
        return `No ${targetModel} exists with id ${targetId}`;
      }

      const input: ChatNoteInput = {
        comment: statement,
        targetModel,
        instanceId: targetId,
        userId,
      };

      const queued = await requestNoteAction(
        "CHAT",
        crypto.randomUUID(),
        input,
      );
      if (!queued) {
        return `Failed to queue. Nothing was recorded.`;
      }

      return [
        `Queued for ${targetModel}.`,
        "The notes agent will compare this against the notes already on that target and may update an existing note instead of creating a new one.",
        "Do not call record_note again for this same fact. State in your reply what you recorded, so it stays on the record for later turn.",
      ].join(" ");
    },
    {
      name: "record_note",
      description: `Record a durable fact the user told you about, so it is available to staff and to every later AI run. Use this to record, correct, or retract information. A separate notes agent reads the notes that already exist on the target and decides whether to create a new note, update an existing one, or delete one. Before calling, check the "notes" array already returned on that record by query_platform_data - if the fact is there, say so instead of recording it again.One atomic fact per call. Recording is asynchronous, so never tell the user a specific note was created, say you have recorded the fact. For DEVICE_GROUP_MATCHING, send deviceGroupMatching (manufacturer/product/version names) instead of instanceId. If no matching is found, nothing is recorded and you get relatedMatchings: run again with one of them as deviceGroupMatching, or with create: true to create a new one.`,
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
          .nullish()
          .describe(
            "The id of the record, taken from a query_platform_data result. Never invent one. Not needed when you send deviceGroupMatching.",
          ),
        deviceGroupMatching: z
          .object({
            manufacturerName: z.string(),
            productName: z.string().nullish(),
            version: z.string().nullish(),
            versionRange: z
              .string()
              .nullish()
              .describe("VERS range, e.g. 'vers:semver />=2.0|<3.0'."),
          })
          .nullish()
          .describe(
            "DEVICE_GROUP_MATCHING only: the make/model (and verison) the fact covers, by name.",
          ),
        create: z
          .boolean()
          .nullish()
          .describe(
            "Only after a call returned no matching: true creates the device group matching, then records the note.",
          ),
      }),
    },
  );
}
