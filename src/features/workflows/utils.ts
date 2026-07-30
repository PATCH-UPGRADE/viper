import type { Node } from "@xyflow/react";
import type { Prisma } from "@/generated/prisma";

type SerializedNode = Omit<Node, "position">;

/**
 * The include a workflow must be loaded with to serialize it: each node's linked
 * asset ids and device-group-matching ids (surfaced into node.data), plus its
 * connections.
 */
export const workflowSerializeInclude = {
  nodes: {
    include: {
      assets: { select: { id: true } },
      deviceGroupMatchings: { select: { id: true } },
    },
  },
  connections: true,
} satisfies Prisma.WorkflowInclude;

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: typeof workflowSerializeInclude;
}>;

// Node-focused serialization for LLM/markdown consumers. Each node's linked
// asset / device-group-matching ids are folded into node.data (the same shape
// the editor uses). Edges are intentionally omitted — topology is conveyed via
// the Mermaid diagram, and the raw edge list is noise in the JSON the agent
// reads. Callers that need edges build them from workflow.connections directly.
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
