import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import prisma from "@/lib/db";
import { generateMemoryMarkdown } from "../../utils";

export const readMemories = createTool({
  name: "read_memories",
  description:
    "Retrieve your saved memories about this user before responding. Always call this first at the start of every conversation.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const memories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    return generateMemoryMarkdown(memories);
  },
});
