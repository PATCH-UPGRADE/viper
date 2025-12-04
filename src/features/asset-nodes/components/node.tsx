"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { CircleQuestionMark } from "lucide-react";
import { memo, useState } from "react";
import { BaseAssetNode } from "./base-asset-node";
import { AssetFormValues, AssetDialog } from "./dialog";
import { DeviceIconType, getIconByType } from "../types";

type AssetNodeData = {
  icon?: string;
  label?: string;
  description?: string;
  cpes?: string[];
  assetIds?: string[];
};

type AssetNodeType = Node<AssetNodeData>;

export const AssetNode = memo((props: NodeProps<AssetNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: AssetFormValues) => {
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
  const vulnerabilities: any[] = []; // TODO;
  const nodeStatus = vulnerabilities.length > 0 ? "error" : "initial";
  const getDescription = () => {
    let description = "No vulnerabilities identified";
    if (!nodeData.assetIds && !nodeData.cpes) {
      description = "No devices specified.";
    } else if (vulnerabilities.length > 0) {
      description = `${vulnerabilities.length} vulnerabilities identified!`;
    }
    return description;
  }
  const description = getDescription()

  const Icon = nodeData.icon ? getIconByType(nodeData.icon as DeviceIconType) : CircleQuestionMark

  return (
    <>
      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseAssetNode
        {...props}
        id={props.id}
        icon={Icon}
        name={nodeData?.label || "Device Node"}
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

AssetNode.displayName = "AssetNode";
