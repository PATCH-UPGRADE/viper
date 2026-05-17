import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import prisma from "@/lib/db";
import {
  assetContextInclude,
  generateContextMarkdown,
  generateMemoryMarkdown,
  remediationContextInclude,
  vulnerabilityContextInclude,
} from "../../utils";

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve full context about the current user and environment before responding. Returns saved memories plus all assets, vulnerabilities, and remediations with their cross-entity relationships. Call once at the start of a thread.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const userRole = network?.state.data.userRole as string | undefined;

    const [memories, assets, vulnerabilities, remediations] = await Promise.all(
      [
        prisma.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.asset.findMany({ include: assetContextInclude }),
        prisma.vulnerability.findMany({ include: vulnerabilityContextInclude }),
        prisma.remediation.findMany({ include: remediationContextInclude }),
      ],
    );

    // TODO(network-flow): fetch + render network communication graph here.
    // TODO(workflows): fetch + render clinical workflow definitions (text + mermaid).
    // TODO(utilization): fetch + render device utilization windows.

    return `${generateMemoryMarkdown(memories)}\n\n---\n\n${generateContextMarkdown(assets, vulnerabilities, remediations, userRole)}`;
  },
});
