import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import prisma from "@/lib/db";

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve context about the current user before responding. Always call this first at the start of every conversation.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const memories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (memories.length === 0) {
      return "## Memories\n\nNo memories saved yet.";
    }

    return [
      "## Memories",
      "",
      ...memories.map((m) => `- [${m.id}] ${m.content}`),
    ].join("\n");
  },
});
