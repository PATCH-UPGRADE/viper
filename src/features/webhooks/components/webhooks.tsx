"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type PropsWithChildren, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityList,
  EntityPagination,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthenticationInputType } from "@/features/integrations/types";
import {
  useCreateWebhook,
  useRemoveWebhook,
  useSuspenseWebhooks,
  useUpdateWebhook,
} from "@/features/webhooks/hooks/use-webhooks";
import { AuthType, TriggerEnum, type Webhook } from "@/generated/prisma";
import { usePaginationParams } from "@/lib/pagination";
import { type WebhookFormValues, webhookInputSchema } from "../types";

const triggerDescriptions = {
  [TriggerEnum.DeviceGroup_Created]: "When a Device Group is created",
  [TriggerEnum.DeviceGroup_Updated]: "When a Device Group is updated",
  [TriggerEnum.Artifact_Created]: "(WIP) When an Artifact is created",
  [TriggerEnum.Artifact_Updated]: "(WIP) When an Artifact is updated",
};

export const WebhooksList = () => {
  const webhooks = useSuspenseWebhooks();

  return (
    <EntityList
      items={webhooks.data.items}
      getKey={(item) => item.id}
      renderItem={(webhook) => <WebhookItem data={webhook} />}
      emptyView={<WebhooksEmpty />}
    />
  );
};

const WebhookCreateModal = ({
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
  const authType = form.watch("authType");
  const label = isUpdate ? "Update Webhook" : "Create Webhook";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{label}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Webhook name"
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
                    <FormLabel>Callback URL</FormLabel>
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

              <FormField
                control={form.control}
                name="authType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authentication Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select authentication type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Auth Type</SelectLabel>
                          {Object.keys(AuthType).map((authType) => (
                            <SelectItem value={authType} key={authType}>
                              {authType}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {authType === "Basic" && (
                <>
                  <FormField
                    control={form.control}
                    name="authentication.username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="authentication.password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {authType === "Bearer" && (
                <FormField
                  control={form.control}
                  name="authentication.token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Bearer token"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {authType === "Header" && (
                <>
                  <FormField
                    control={form.control}
                    name="authentication.header"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Header Name</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="X-API-Key"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="authentication.value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Header Value</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Header value"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="triggers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Send a notification when:</FormLabel>
                    <FormControl>
                      <div>
                        {Object.entries(triggerDescriptions).map(
                          ([key, value], index) => (
                            <div key={index} className="flex gap-x-1 text-sm">
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
                              <span className="font-semibold">{key}</span>
                              <span className="">- {value}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isPending}>
                {label}
              </Button>
            </div>
          </form>
        </Form>
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
      onSuccess: (_data) => {
        setOpen(false);
      },
      onError: () => {
        setOpen(true);
      },
    });
  };

  return (
    <>
      <EntityHeader
        title="Webhooks"
        description="Manage Webhooks"
        onNew={() => setOpen(true)}
        newButtonLabel="New Webhook"
      />
      <WebhookCreateModal
        form={form}
        open={open}
        setOpen={setOpen}
        handleCreate={handleCreate}
      />
    </>
  );
};

export const WebhooksPagination = () => {
  const items = useSuspenseWebhooks();
  const [params, setParams] = usePaginationParams();

  return (
    <EntityPagination
      disabled={items.isFetching}
      totalPages={items.data.totalPages}
      page={items.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const WebhooksContainer = ({ children }: PropsWithChildren) => {
  return (
    <EntityContainer
      header={<WebhooksHeader />}
      pagination={<WebhooksPagination />}
    >
      {children}
    </EntityContainer>
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

export const WebhookItem = ({ data }: { data: Webhook }) => {
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
      authentication: data.authentication as AuthenticationInputType,
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
      <div className="flex items-center gap-3 p-4 border rounded-lg">
        <div className="flex-1 min-w-0">
          <div className="flex gap-2">
            <span>Name: {data.name}</span>
          </div>
          <p>{JSON.stringify(data)}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={updateWebhook.isPending}
        >
          {updateWebhook.isPending ? "Updating..." : "Update"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleRemove}
          disabled={removeItem.isPending}
        >
          {removeItem.isPending ? "Deleting..." : "Delete"}
        </Button>
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
};
