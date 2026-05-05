import { createTool } from "@inngest/agent-kit";
import { z } from "zod";

export const manageMemoriesTool = createTool({
  name: "manage_memories",
  description: `Create, update, and/or delete memories in a single atomic operation.
Use this to persist meaningful facts about the user (role, hospital context, recurring concerns, technical focus areas).
Avoid duplicates — use update if a similar memory already exists.
Do not save one-time queries or transient requests.`,
  parameters: z.object({
    creations: z
      .array(z.string())
      .optional()
      .describe("New statements to save as memories."),
    updates: z
      .array(
        z.object({
          id: z.string().describe("ID of the memory to update."),
          statement: z.string().describe("The corrected information to save."),
        }),
      )
      .optional()
      .describe("Memories to update."),
    deletions: z
      .array(
        z.object({
          id: z.string().describe("ID of the memory to delete."),
        }),
      )
      .optional()
      .describe("Memories to delete."),
  }),
  handler: async ({ creations, updates, deletions }, { network, step }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const operations = [
      ...(creations ?? []).map((content) => ({ content })),
      ...(updates ?? []).map(({ id, statement }) => ({
        id,
        content: statement,
      })),
      ...(deletions ?? []).map(({ id }) => ({ id, delete: true as const })),
    ];

    if (operations.length === 0) return "No operations to perform.";

    await step?.sendEvent("manage-memories", {
      name: "app/memories.manage",
      data: { userId, operations },
    });

    return `Scheduled ${operations.length} memory operation(s).`;
  },
});
