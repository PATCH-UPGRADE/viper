"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import { PlusIcon, SyringeIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NodeType } from "@/generated/prisma";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { DeviceIconType, getIconByType } from "@/features/asset-nodes/types";

export type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }> | string;
};

const actionNodes: NodeTypeOption[] = [
  {
    type: NodeType.STEP,
    label: "Prepare Medication",
    description: "Prepare medication for administration",
    icon: SyringeIcon,
  },
  {
    type: NodeType.STEP,
    label: "Blood Draw",
    description: "Patient blood draw procedure",
    icon: SyringeIcon,
  },
];

const deviceNodeTypes: NodeTypeOption[] = [
  {
    type: NodeType.ASSET,
    icon: DeviceIconType.InfusionPump,
    label: "Infusion Pump",
    description: "Models an Infusion Pump",
  },
  {
    type: NodeType.ASSET,
    icon: DeviceIconType.PatientMonitor,
    label: "Patient Monitor",
    description: "Models a patient monitor",
  },
  {
    type: NodeType.ASSET,
    icon: DeviceIconType.WOW,
    label: "Workstation on Wheels",
    description: "Models a workstation on wheels",
  },
];

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const NodeTemplateMenuItem = ({
  nodeTemplate,
  onClick,
}: {
  nodeTemplate: NodeTypeOption;
  onClick?: () => void;
}) => {
  const Icon =
    typeof nodeTemplate.icon === "string"
      ? (getIconByType(nodeTemplate.icon as DeviceIconType) ?? SyringeIcon)
      : nodeTemplate.icon;
  return (
    <div
      key={nodeTemplate.label}
      className="w-full justify-start h-auto py-5 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary"
      onClick={onClick}
    >
      <div className="flex items-center gap-6 w-full overflow-hidden">
        <Icon className="size-5" />
        <div className="flex flex-col items-start text-left">
          <span className="font-medium text-sm">{nodeTemplate.label}</span>
          <span className="text-xs text-muted-foreground">
            {nodeTemplate.description}
          </span>
        </div>
      </div>
    </div>
  );
};

const NodeTemplateCreateSheet = ({
  nodeType,
  open,
  setOpen,
}: {
  nodeType?: NodeType;
  open: boolean;
  setOpen: (b: boolean) => void;
}) => {
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">
            Create {nodeType === NodeType.ASSET ? "Device" : "Action"} Node
          </SheetTitle>
        </SheetHeader>
        <p>TODO</p>
      </SheetContent>
    </Sheet>
  );
};

export function NodeSelector({
  open,
  onOpenChange,
  children,
}: NodeSelectorProps) {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const [openModal, setOpenModal] = useState(false);
  const [nodeType, setNodeType] = useState<NodeType | undefined>(undefined);

  const addNodeTemplate = (nodeType: NodeType) => {
    setNodeType(nodeType);
    setOpenModal(true);
    return;
  };

  const handleNodeSelect = useCallback(
    (selection: NodeTypeOption) => {
      setNodes((nodes) => {
        const hasInitialTrigger = nodes.some(
          (node) => node.type === NodeType.INITIAL,
        );

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPosition = screenToFlowPosition({
          x: centerX + (Math.random() - 0.5) * 200,
          y: centerY + (Math.random() - 0.5) * 200,
        });

        const newNode = {
          id: createId(),
          data: {
            icon: selection.icon,
            label: selection.label,
            description: selection.description,
          },
          position: flowPosition,
          type: selection.type,
        };

        if (hasInitialTrigger) {
          newNode.position = { x: 0, y: 0 };
          return [newNode];
        }

        return [...nodes, newNode];
      });

      onOpenChange(false);
    },
    [setNodes, getNodes, onOpenChange, screenToFlowPosition],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-lg">What happens next?</SheetTitle>
            <SheetDescription>
              Select a node for this clinical workflow.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <h3 className="font-semibold">Action Nodes</h3>
            <p className="text-sm mt-2 text-muted-foreground">
              Represents a clinical or operational action
            </p>
          </div>
          <div>
            {actionNodes.map((nodeType, idx) => {
              return (
                <NodeTemplateMenuItem
                  key={`node-menu-${nodeType.type}-${idx}`}
                  nodeTemplate={nodeType}
                  onClick={() => handleNodeSelect(nodeType)}
                />
              );
            })}
            <Button
              className="mx-4 mt-4"
              onClick={() => addNodeTemplate(NodeType.STEP)}
            >
              New action node <PlusIcon />
            </Button>
          </div>
          <Separator />
          <div className="px-4">
            <h3 className="font-semibold">Device Nodes</h3>
            <p className="text-sm mt-2 text-muted-foreground">
              Represents the explicit use of a medical device or asset
            </p>
          </div>
          <div>
            {deviceNodeTypes.map((nodeType, idx) => {
              return (
                <NodeTemplateMenuItem
                  key={`node-menu-${nodeType.type}-${idx}`}
                  nodeTemplate={nodeType}
                  onClick={() => handleNodeSelect(nodeType)}
                />
              );
            })}
            {/*TODO: this should actually be relatively easy? just re-use the form i created in `dialog.tsx`, then make a new node...*/}
            <Button
              className="mx-4 mt-4"
              onClick={() => addNodeTemplate(NodeType.ASSET)}
            >
              New device node <PlusIcon />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <NodeTemplateCreateSheet
        nodeType={nodeType}
        open={openModal}
        setOpen={setOpenModal}
      />
    </>
  );
}
