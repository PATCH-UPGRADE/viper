import { InitialNode } from "@/components/initial-node";
import { NodeType } from "@/generated/prisma";
import type { NodeTypes } from "@xyflow/react";

import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { AssetNode } from "@/features/asset-nodes/components/node";
import { StepNode } from "@/features/step-nodes/components/node";

export const nodeComponents = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.ASSET]: AssetNode,
  [NodeType.STEP]: StepNode,
} as const satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
