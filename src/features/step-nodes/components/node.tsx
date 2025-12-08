"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { CircleQuestionMark } from "lucide-react";
import { memo, useState } from "react";
import { BaseStepNode } from "./base-step-node";
import { StepFormValues, StepDialog } from "./dialog";

type StepNodeData = {
  icon?: string;
  label?: string;
  description?: string;
};

type StepNodeType = Node<StepNodeData>;

export const StepNode = memo((props: NodeProps<StepNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: StepFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }
        return node;
      }),
    );
  };

  const nodeData = props.data;
  const nodeStatus = "initial";

  return (
    <>
      <StepDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseStepNode
        {...props}
        id={props.id}
        icon={CircleQuestionMark}
        name={nodeData?.label || "Step Node"}
        status={nodeStatus}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

StepNode.displayName = "StepNode";
