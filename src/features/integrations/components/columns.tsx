"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
  MoreVertical,
  RefreshCw,
  RotateCwIcon,
  Sparkles,
  SquarePen,
  TrashIcon,
} from "lucide-react";
import ms from "ms";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiTokenSuccessModal } from "@/features/user/components/user";
import {
  type Apikey,
  type ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import {
  useRemoveIntegration,
  useRotateIntegration,
  useTriggerSync,
  useUpdateIntegration,
} from "../hooks/use-integrations";
import {
  type AuthenticationInputType,
  type IntegrationFormValues,
  type IntegrationWithRelations,
  integrationInputSchema,
} from "../types";
import {
  IntegrationCreateModal,
  RotateIntegrationConfirmModal,
  SyncStatusIndicator,
} from "./integrations";

export const getIntegrationColumns = (
  resourceType: ResourceType,
): ColumnDef<IntegrationWithRelations>[] => {
  return [
    {
      id: "sync",
      header: "Sync",
      cell: ({ row }) => {
        const triggerSync = useTriggerSync();
        const handleSync = async () => {
          await triggerSync.mutateAsync({ id: row.original.id });
        };
        return (
          <Button
            onClick={handleSync}
            disabled={triggerSync.isPending}
            className="font-semibold"
          >
            <RefreshCw
              className={triggerSync.isPending ? "animate-spin" : ""}
            />
            {triggerSync.isPending ? "Syncing..." : "Sync Now"}
          </Button>
        );
      },
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => <SortableHeader header="Name" column={column} />,
      cell: ({ row }) => {
        return (
          <div className="flex gap-1 items-center">
            {row.original.isGeneric && <Sparkles size={15} />}
            <div className="font-semibold max-w-60 overflow-ellipsis overflow-hidden">
              {row.original.name}
            </div>
          </div>
        );
      },
    },
    {
      meta: { title: "API URL" },
      header: "API URL",
      accessorKey: "integrationUri",
      cell: ({ row }) => {
        return (
          <div className="font-mono max-w-80 overflow-ellipsis overflow-hidden">
            {row.original.integrationUri}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      meta: { title: "Status" },
      header: ({ column }) => (
        <SortableHeader header="Status" column={column} />
      ),
      cell: ({ row }) => {
        const syncStatus = row.original.syncStatus[0];
        return (
          <Tooltip>
            <TooltipTrigger>
              <SyncStatusIndicator status={syncStatus?.status} />
            </TooltipTrigger>
            {syncStatus && syncStatus?.status === SyncStatusEnum.Error && (
              <TooltipContent>{syncStatus.errorMessage}</TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "lastSynced",
      meta: { title: "Last Synced" },
      header: ({ column }) => (
        <SortableHeader header="Last Synced" column={column} />
      ),
      cell: ({ row }) => {
        const lastSynced = row.original.syncStatus[0]?.syncedAt;
        return (
          <Tooltip>
            <TooltipTrigger>
              {lastSynced ? `${formatDistanceToNow(lastSynced)} ago` : "Never"}
            </TooltipTrigger>
            <TooltipContent>
              {lastSynced ? lastSynced.toLocaleString() : "Never"}
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "syncEvery",
      meta: { title: "Frequency" },
      header: "Frequency",
      // ms is one of those libraries that makes me feel like I'm incurring another left-pad incident
      // but welcome to modern modular javascript <3
      accessorFn: (row) => `Every ${ms(1000 * row.syncEvery)}`,
    },
    {
      meta: { title: "Created Items" },
      header: resourceType,
      cell: ({ row }) => {
        const counts = row.original._count;
        switch (resourceType) {
          case "Asset":
            return counts.assetMappings;
          case "Vulnerability":
            return counts.vulnerabilityMappings;
          case "DeviceArtifact":
          case "Remediation":
            return "TODO";
        }
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const data = row.original;

        const removeItem = useRemoveIntegration();
        const handleRemove = () => {
          removeItem.mutate({ id: data.id });
        };

        const updateIntegration = useUpdateIntegration();
        const rotateIntegration = useRotateIntegration();
        const [open, setOpen] = useState(false);
        const [rotateOpen, setRotateOpen] = useState(false);
        const [successOpen, setSuccessOpen] = useState(false);
        const [key, setKey] = useState<Apikey | undefined>(undefined);

        const form = useForm<IntegrationFormValues>({
          resolver: zodResolver(integrationInputSchema),
          defaultValues: {
            name: data.name,
            platform: data.platform || "",
            integrationUri: data.integrationUri,
            isGeneric: data.isGeneric,
            prompt: data.prompt || "",
            authType: data.authType,
            resourceType: data.resourceType,
            syncEvery: data.syncEvery || 300,
            authentication: data.authentication as AuthenticationInputType,
          },
        });

        const handleUpdate = (item: IntegrationFormValues) => {
          updateIntegration.mutate(
            { id: data.id, data: item },
            {
              onSuccess: () => {
                setOpen(false);
              },
              onError: () => {
                setOpen(true);
              },
            },
          );
        };

        const handleRotate = () => {
          rotateIntegration.mutate(
            { id: data.id },
            {
              onSuccess: (data) => {
                setKey(data.apiKey);
                setSuccessOpen(true);
              },
              onError: () => {
                setRotateOpen(true);
              },
            },
          );
        };

        return (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem
                  onClick={() => setOpen(true)}
                  disabled={updateIntegration.isPending}
                >
                  <SquarePen />
                  {updateIntegration.isPending ? "Updating..." : "Update"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRotateOpen(true)}>
                  <RotateCwIcon /> Rotate API Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleRemove}
                  disabled={removeItem.isPending}
                  variant="destructive"
                >
                  <TrashIcon strokeWidth={3} /> Delete Integration
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {open && (
              <IntegrationCreateModal
                form={form}
                open={open}
                setOpen={setOpen}
                handleCreate={handleUpdate}
                isUpdate={true}
              />
            )}
            {rotateOpen && (
              <RotateIntegrationConfirmModal
                open={rotateOpen}
                setOpen={setRotateOpen}
                handleRotate={handleRotate}
              />
            )}
            {successOpen && (
              <ApiTokenSuccessModal
                open={successOpen}
                setOpen={setSuccessOpen}
                apiKey={key}
              />
            )}
          </>
        );
      },
    },
  ];
};
