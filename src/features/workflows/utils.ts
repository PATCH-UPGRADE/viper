import type { Node } from "@xyflow/react";
import type { Prisma } from "@/generated/prisma";

type SerializedNode = Omit<Node, "position">;

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: { nodes: true; connections: true };
}>;

export type SerializedWorkflow = ReturnType<typeof serializeWorkflow>;

export function serializeWorkflow(workflow: WorkflowWithRelations) {
  const nodes: SerializedNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    data: { ...(node.data as Record<string, unknown>), name: node.name },
  }));
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes,
  };
}
