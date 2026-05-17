import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import prisma from "@/lib/db";
import { generateContextMarkdown, generateMemoryMarkdown } from "../../utils";

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve full context about the current user and environment before responding. Returns saved memories plus all assets, vulnerabilities, and remediations in the system.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const [memories, assets, vulnerabilities, remediations] = await Promise.all(
      [
        prisma.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.asset.findMany({ include: { deviceGroup: true } }),
        prisma.vulnerability.findMany(),
        prisma.remediation.findMany(),
      ],
    );

    return `${generateMemoryMarkdown(memories)}\n\n${generateContextMarkdown(assets, vulnerabilities, remediations)}`;
  },
});
