import type { NodeTypes } from "@xyflow/react";
import { AssetNode } from "@/features/asset-nodes/components/node";
import { StepNode } from "@/features/step-nodes/components/node";
import { NodeType } from "@/generated/prisma";

export const nodeComponents = {
  [NodeType.ASSET]: AssetNode,
  [NodeType.STEP]: StepNode,
} as const satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
