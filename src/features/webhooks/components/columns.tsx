"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { SquarePen, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRemoveWebhook, useUpdateWebhook } from "../hooks/use-webhooks";
import {
  type WebhookFormValues,
  type WebhookResponse,
  webhookInputSchema,
} from "../types";
import { triggerDescriptions, WebhookCreateModal } from "./webhooks";

export const columns: ColumnDef<WebhookResponse>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader header="Webhook Name" column={column} />
    ),
  },
  {
    meta: { title: "Webhook URL" },
    header: "Webhook URL",
    cell: ({ row }) => {
      return (
        <div className="font-mono max-w-80 overflow-ellipsis overflow-hidden">
          {row.original.callbackUrl}
        </div>
      );
    },
  },
  {
    meta: { title: "Events" },
    header: "Events",
    cell: ({ row }) => {
      return (
        <Tooltip>
          <TooltipTrigger>{row.original.triggers.length}</TooltipTrigger>
          <TooltipContent>
            <ul>
              {row.original.triggers.map((item) => (
                <li key={item} className="flex gap-1.5">
                  {triggerDescriptions[item]}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const data = row.original;

      const removeItem = useRemoveWebhook();

      const handleRemove = () => {
        removeItem.mutate({ id: data.id });
      };

      const updateWebhook = useUpdateWebhook();
      const [open, setOpen] = useState(false);

      const form = useForm<WebhookFormValues>({
        resolver: zodResolver(webhookInputSchema),
        defaultValues: {
          name: data.name,
          callbackUrl: data.callbackUrl,
          triggers: data.triggers,
          authType: data.authType,
        },
      });

      const handleUpdate = (item: WebhookFormValues) => {
        updateWebhook.mutate(
          { id: data.id, ...item },
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

      return (
        <>
          <div className="flex gap-0.5 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setOpen(true)}
                >
                  <span className="sr-only">Update Webhook</span>
                  <SquarePen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Update Webhook</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleRemove}
                >
                  <span className="sr-only">Delete Webhook</span>
                  <TrashIcon className="h-4 w-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Webhook</TooltipContent>
            </Tooltip>
          </div>

          {open && (
            <WebhookCreateModal
              form={form}
              open={open}
              setOpen={setOpen}
              handleCreate={handleUpdate}
              isUpdate={true}
            />
          )}
        </>
      );
    },
  },
];
