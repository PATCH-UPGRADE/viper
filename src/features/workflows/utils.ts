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
      deviceTypes: { select: { id: true } },
    },
  },
} satisfies Prisma.WorkflowInclude;

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: typeof workflowSerializeInclude;
}>;

/**
 * `where` selecting workflows a set of assets/device types participate in: a
 * node links one of the assets directly, or links one of the device types.
 * Callers guard the all-empty case (this returns `{ OR: [] }`, which matches
 * nothing).
 */
export function workflowsUsingAssetsOrDeviceTypes(
  assetIds: string[],
  deviceTypeIds: string[],
): Prisma.WorkflowWhereInput {
  const or: Prisma.WorkflowWhereInput[] = [];
  if (assetIds.length > 0) {
    or.push({
      nodes: { some: { assets: { some: { id: { in: assetIds } } } } },
    });
  }
  if (deviceTypeIds.length > 0) {
    or.push({
      nodes: {
        some: { deviceTypes: { some: { id: { in: deviceTypeIds } } } },
      },
    });
  }
  return { OR: or };
}

// Node-focused serialization for LLM/markdown consumers. Each node's linked
// asset / device type ids are folded into node.data
export function serializeWorkflow(workflow: WorkflowWithRelations) {
  const nodes: SerializedNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    data: {
      ...(node.data as Record<string, unknown>),
      name: node.name,
      assetIds: node.assets.map((asset) => asset.id),
      deviceTypeIds: node.deviceTypes.map((deviceType) => deviceType.id),
    },
  }));
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes,
  };
}
