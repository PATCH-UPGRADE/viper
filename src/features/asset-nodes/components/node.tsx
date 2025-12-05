"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { BugIcon, CircleQuestionMark, ComputerIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseAssetNode } from "./base-asset-node";
import { AssetFormValues, AssetDialog } from "./dialog";
import { DeviceIconType, getIconByType } from "../types";
import { useSuspenseAssetsVulns } from "@/features/assets/hooks/use-assets";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";

export type AssetNodeData = {
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
              // Transform data from objects (for useFieldArray to work) into array
              cpes: values.cpes?.map((cpe) => cpe.value),
              assetIds: values.assetIds?.map((id) => id.value),
            },
          };
        }
        return node;
      }),
    );
  };

  const nodeData = props.data;

  const assetsWithVulns = useSuspenseAssetsVulns({
    assetIds: nodeData.assetIds ?? [],
    cpes: nodeData.cpes ?? [],
  });
  const numVulns = assetsWithVulns.data.vulnerabilitiesCount;
  const numAssets = assetsWithVulns.data.assetsCount;

  const nodeStatus = numVulns > 0 ? "vulnerable" : "initial";

  const description = nodeData.description;

  const Icon = nodeData.icon
    ? getIconByType(nodeData.icon as DeviceIconType)
    : CircleQuestionMark;

  return (
    <>
      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
        assets={assetsWithVulns ? assetsWithVulns.data.assets : []}
        vulnerabilities={
          assetsWithVulns ? assetsWithVulns.data.vulnerabilities : []
        }
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
      >
        <div
          className="absolute top-0 left-0 flex flex-col gap-0.5"
          style={{ transform: "translate(-100%)", marginLeft: "-0.5rem" }}
        >
          <Badge
            className={cn(
              "text-[6px]",
              numAssets === 0 ? "border-red-500" : "",
            )}
            variant="outline"
          >
            <ComputerIcon className="w-2! h-2!" />
            {numAssets}
          </Badge>
          <Badge
            className={cn("text-[6px]", numVulns > 0 ? "border-red-500" : "")}
            variant="outline"
          >
            <BugIcon className="w-2! h-2!" />
            {numVulns}
          </Badge>
        </div>
      </BaseAssetNode>
    </>
  );
});

AssetNode.displayName = "AssetNode";
