"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import { GlobeIcon, MousePointerIcon, SyringeIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
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
import { se } from "date-fns/locale";

export type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }> | string;
};

const actionNodes: NodeTypeOption[] = [
  {
    type: NodeType.HTTP_REQUEST,
    label: "Prepare Medication",
    description: "Prepare medication for administration",
    icon: SyringeIcon,
  },
  {
    type: NodeType.HTTP_REQUEST,
    label: "Blood Draw",
    description: "Patient blood draw procedure",
    icon: SyringeIcon,
  },
];

const deviceNodeTypes: NodeTypeOption[] = [
  {
    type: NodeType.HTTP_REQUEST,
    label: "Infusion Pump",
    description: "Models an Infusion Pump",
    icon: SyringeIcon,
  },
  {
    type: NodeType.HTTP_REQUEST,
    label: "EMR",
    description: "Electronic Medical Record System",
    icon: SyringeIcon,
  },
];

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

// TODO: migrate, get the type of node template, put that here
// add a create form for these
// make sure everything saves properly
// once migrated, also create some real NodeTemplate types (seed db), instead of using
//   above data...
const NodeTemplateMenuItem = ({
  nodeTemplate,
  onClick,
}: {
  nodeTemplate: any;
  onClick?: () => void;
}) => {
  const Icon = nodeTemplate.icon;
  return (
    <div
      key={nodeTemplate.label}
      className="w-full justify-start h-auto py-5 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary"
      onClick={onClick}
    >
      <div className="flex items-center gap-6 w-full overflow-hidden">
        {typeof Icon === "string" ? (
          <img
            src={Icon}
            alt={nodeTemplate.label}
            className="size-5 object-contain rounded-sm"
          />
        ) : (
          <Icon className="size-5" />
        )}
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

export function NodeSelector({
  open,
  onOpenChange,
  children,
}: NodeSelectorProps) {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const handleNodeSelect = useCallback(
    (selection: NodeTypeOption) => {
      // Check if trying to add a manual trigger when one already exists
      if (selection.type === NodeType.MANUAL_TRIGGER) {
        const nodes = getNodes();
        const hasManualTrigger = nodes.some(
          (node) => node.type === NodeType.MANUAL_TRIGGER,
        );

        if (hasManualTrigger) {
          toast.error("Only one manual trigger is allowed per workflow");
          return;
        }
      }

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
          return [newNode];
        }

        return [...nodes, newNode];
      });

      onOpenChange(false);
    },
    [setNodes, getNodes, onOpenChange, screenToFlowPosition],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
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
          {actionNodes.map((nodeType) => {
            return (
              <NodeTemplateMenuItem
                nodeTemplate={nodeType}
                onClick={() => handleNodeSelect(nodeType)}
              />
            );
          })}
        </div>
        <Separator />
        <div className="px-4">
          <h3 className="font-semibold">Device Nodes</h3>
          <p className="text-sm mt-2 text-muted-foreground">
            Represents the explicit use of a medical device or asset
          </p>
        </div>
        <div>
          {deviceNodeTypes.map((nodeType) => {
            return (
              <NodeTemplateMenuItem
                nodeTemplate={nodeType}
                onClick={() => handleNodeSelect(nodeType)}
              />
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
