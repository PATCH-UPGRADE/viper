"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ComputerIcon, CpuIcon, FileIcon, PlusIcon } from "lucide-react";
import { type PropsWithChildren, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { AuthenticationFields } from "@/components/auth-form";
import {
  EmptyView,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import {
  useCreateWebhook,
  useSuspenseWebhooks,
} from "@/features/webhooks/hooks/use-webhooks";
import { AuthType, TriggerEnum } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { usePaginationParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { type WebhookFormValues, webhookInputSchema } from "../types";
import { columns } from "./columns";

export const triggerDescriptions = {
  [TriggerEnum.Artifact_Created]: (
    <>
      <FileIcon size={15} />{" "}
      <span>
        An <b>Artifact</b> is created
      </span>
    </>
  ),
  [TriggerEnum.Artifact_Updated]: (
    <>
      <FileIcon size={15} />{" "}
      <span>
        An <b>Artifact</b> is updated
      </span>
    </>
  ),
  [TriggerEnum.DeviceArtifact_Created]: (
    <>
      <CpuIcon size={15} />{" "}
      <span>
        A <b>Device Artifact</b> is created
      </span>
    </>
  ),
  [TriggerEnum.DeviceArtifact_Updated]: (
    <>
      <CpuIcon size={15} />{" "}
      <span>
        A <b>Device Artifact</b> is updated
      </span>
    </>
  ),
  [TriggerEnum.DeviceGroup_Created]: (
    <>
      <ComputerIcon size={15} />{" "}
      <span>
        A <b>Device Group</b> is created
      </span>
    </>
  ),
  [TriggerEnum.DeviceGroup_Updated]: (
    <>
      <ComputerIcon size={15} />{" "}
      <span>
        A <b>Device Group</b> is updated
      </span>
    </>
  ),
};

export const WebhooksSearch = () => {
  const [params, setParams] = usePaginationParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search webhooks by name"
    />
  );
};

export const WebhooksList = () => {
  const { data: webhooks, isFetching } = useSuspenseWebhooks();

  return (
    <DataTable
      search={<WebhooksSearch />}
      paginatedData={webhooks}
      columns={columns}
      isLoading={isFetching}
    />
  );
};

export const WebhookCreateModal = ({
  form,
  handleCreate,
  open,
  setOpen,
  isUpdate,
}: {
  form: UseFormReturn<WebhookFormValues>;
  handleCreate: (values: WebhookFormValues) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  isUpdate?: boolean;
}) => {
  const onChangeTriggers = (newValue: string): TriggerEnum[] => {
    const trigger = newValue as keyof typeof TriggerEnum;
    if (!trigger) {
      return form.getValues("triggers");
    }

    const newList = [...form.getValues("triggers")];
    const index = newList.indexOf(trigger);

    if (index !== -1) {
      newList.splice(index, 1);
    } else {
      newList.push(trigger);
    }

    newList.sort();
    return newList;
  };

  const onSubmit = (values: WebhookFormValues) => {
    handleCreate(values);
  };

  const isPending = form.formState.isSubmitting;
  const verbLabel = isUpdate ? "Update" : "Create";
  const label = `${verbLabel} ${!isUpdate ? "New" : ""} Webhook`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b gap-1">
          <DialogTitle className="text-xl">{label}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="webhook-form" className="px-6">
            <div className="no-scrollbar -mx-6 px-6 py-4 max-h-[60vh] overflow-y-auto grid gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook Name *</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Hawksbill TA3 Webhook"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="callbackUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL *</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="https://example.com/api"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* @ts-expect-error this works, but ts doesn't want you to pass a partial form (extended types don't work) */}
              <AuthenticationFields form={form} />

              <FormField
                control={form.control}
                name="triggers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Send a notification when:</FormLabel>
                    <FormControl>
                      <div className="border-1 bg-muted p-4 flex flex-col gap-2">
                        {Object.entries(triggerDescriptions).map(
                          ([key, value], index) => (
                            <label
                              key={index}
                              className="flex gap-x-1 text-sm cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={field.value.includes(
                                  key as keyof typeof TriggerEnum,
                                )}
                                onChange={(_e) => {
                                  const updatedList = onChangeTriggers(key);
                                  field.onChange(updatedList);
                                }}
                              />
                              <span className="flex gap-1.5 items-center ml-1">
                                {value}
                              </span>
                            </label>
                          ),
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        <DialogFooter className="px-6 py-4 bg-muted border-t justify-between!">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            form="webhook-form"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isPending}
          >
            {verbLabel} Webhook 
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const WebhooksHeader = () => {
  const createWebhook = useCreateWebhook();
  const [open, setOpen] = useState(false);

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookInputSchema),
    defaultValues: {
      name: "",
      callbackUrl: "",
      triggers: [],
      authType: AuthType.None,
    },
  });

  const handleCreate = (item: WebhookFormValues) => {
    createWebhook.mutate(item, {
      onSuccess: () => {
        form.reset();
        setOpen(false);
      },
      onError: () => {
        setOpen(true);
      },
    });
  };

  return (
    <>
      <div
        className={cn(
          mainPadding,
          "bg-background flex justify-between items-center",
        )}
      >
        <SettingsSubheader
          title="Webhooks"
          description="Manage where VIPER communicates data to"
        />
        <Button onClick={() => setOpen(true)}>
          <PlusIcon /> New Webhook
        </Button>
      </div>
      <WebhookCreateModal
        form={form}
        open={open}
        setOpen={setOpen}
        handleCreate={handleCreate}
      />
    </>
  );
};

export const WebhooksContainer = ({ children }: PropsWithChildren) => {
  return (
    <>
      <WebhooksHeader />
      <div className={mainPadding}>{children}</div>
    </>
  );
};

export const WebhooksLoading = () => {
  return <LoadingView message="Loading Webhooks..." />;
};

export const WebhooksError = () => {
  return <ErrorView message="Error loading Webhooks" />;
};

export const WebhooksEmpty = () => {
  return <EmptyView message="No Webhooks" />;
};
