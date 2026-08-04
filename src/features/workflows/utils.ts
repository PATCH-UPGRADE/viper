import type { Node } from "@xyflow/react";
import type { Prisma } from "@/generated/prisma";

type SerializedNode = Omit<Node, "position">;

/**
 * The include a workflow must be loaded with to serialize it
 */
export const workflowSerializeInclude = {
  nodes: {
    include: {
      assets: { select: { id: true } },
      deviceGroupMatchings: { select: { id: true } },
    },
  },
} satisfies Prisma.WorkflowInclude;

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: typeof workflowSerializeInclude;
}>;

/**
 * `where` selecting workflows a set of assets/matchings participate in: a node
 * links one of the assets directly, or links one of the device-group matchings.
 * Callers guard the all-empty case (this returns `{ OR: [] }`, which matches
 * nothing).
 */
export function workflowsUsingAssetsOrMatchings(
  assetIds: string[],
  matchingIds: string[],
): Prisma.WorkflowWhereInput {
  const or: Prisma.WorkflowWhereInput[] = [];
  if (assetIds.length > 0) {
    or.push({
      nodes: { some: { assets: { some: { id: { in: assetIds } } } } },
    });
  }
  if (matchingIds.length > 0) {
    or.push({
      nodes: {
        some: { deviceGroupMatchings: { some: { id: { in: matchingIds } } } },
      },
    });
  }
  return { OR: or };
}

// Node-focused serialization for LLM/markdown consumers. Each node's linked
// asset / device-group-matching ids are folded into node.data
export function serializeWorkflow(workflow: WorkflowWithRelations) {
  const nodes: SerializedNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    data: {
      ...(node.data as Record<string, unknown>),
      name: node.name,
      assetIds: node.assets.map((asset) => asset.id),
      deviceGroupMatchingIds: node.deviceGroupMatchings.map(
        (matching) => matching.id,
      ),
    },
  }));
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes,
  };
}
