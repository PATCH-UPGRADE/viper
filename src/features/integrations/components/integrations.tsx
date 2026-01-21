"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type PropsWithChildren, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { toast } from "sonner";
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
import type { Integration, ResourceType } from "@/generated/prisma";
import { usePaginationParams } from "@/lib/pagination";
import {
  useCreateIntegration,
  useRemoveIntegration,
  useSuspenseIntegrations,
  useUpdateIntegration,
} from "../hooks/use-integrations";
import {
  type AuthenticationInputType,
  type IntegrationFormValues,
  integrationInputSchema,
} from "../types";
//import { useApiTokenParams } from "../hooks/use-user-params";
//import { type ApiTokenFormValues, apiTokenInputSchema } from "../types";

export const IntegrationsList = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const integrations = useSuspenseIntegrations(resourceType);

  return (
    <EntityList
      items={integrations.data.items}
      getKey={(item) => item.id}
      renderItem={(integration) => <IntegrationItem data={integration} />}
      emptyView={<IntegrationsEmpty />}
    />
  );
};

const IntegrationCreateModal = ({
  form,
  handleCreate,
  open,
  setOpen,
  isUpdate,
}: {
  form: UseFormReturn<IntegrationFormValues>;
  handleCreate: (values: IntegrationFormValues) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  isUpdate?: boolean;
}) => {
  const onSubmit = (values: IntegrationFormValues) => {
    handleCreate(values);
    setOpen(false);
  };

  const isPending = form.formState.isSubmitting;
  const authType = form.watch("authType");
  const label = isUpdate ? "Update Integration" : "Create Integration";

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
                        placeholder="Integration name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Platform name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="integrationUri"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Integration URI</FormLabel>
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
                name="isGeneric"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Generic Integration
                      </FormLabel>
                    </div>
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="syncEvery"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sync Interval (seconds)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="300"
                        {...field}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(value) ? 300 : value);
                        }}
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
                          <SelectItem value="Basic">Basic</SelectItem>
                          <SelectItem value="Bearer">Bearer</SelectItem>
                          <SelectItem value="Header">Header</SelectItem>
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

export const IntegrationsHeader = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const createIntegration = useCreateIntegration();
  const [open, setOpen] = useState(false);

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationInputSchema),
    defaultValues: {
      name: "",
      resourceType: resourceType,
      isGeneric: false,
      syncEvery: 300,
    },
  });

  const handleCreate = (item: IntegrationFormValues) => {
    createIntegration.mutate(item, {
      onSuccess: () => {
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
        title={`${resourceType} Integrations`}
        description="Manage Integrations"
        onNew={() => setOpen(true)}
        newButtonLabel="New Integration"
      />
      <IntegrationCreateModal
        form={form}
        open={open}
        setOpen={setOpen}
        handleCreate={handleCreate}
      />
    </>
  );
};

export const IntegrationsPagination = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const items = useSuspenseIntegrations(resourceType);
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

export const IntegrationsContainer = ({
  resourceType,
  children,
}: PropsWithChildren<{
  resourceType: ResourceType;
}>) => {
  return (
    <EntityContainer
      header={<IntegrationsHeader resourceType={resourceType} />}
      pagination={<IntegrationsPagination resourceType={resourceType} />}
    >
      {children}
    </EntityContainer>
  );
};

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};

export const IntegrationsEmpty = () => {
  return <EmptyView message="No Integrations" />;
};

export const IntegrationItem = ({ data }: { data: Integration }) => {
  const removeItem = useRemoveIntegration();

  const handleRemove = () => {
    removeItem.mutate({ id: data.id });
  };

  const updateIntegration = useUpdateIntegration();
  const [open, setOpen] = useState(false);

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationInputSchema),
    defaultValues: {
      name: data.name,
      platform: data.platform || "",
      integrationUri: data.integrationUri,
      isGeneric: data.isGeneric,
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

  return (
    <>
      <div className="flex items-center gap-3 p-4 border rounded-lg">
        <div className="flex-1 min-w-0">
          <div className="flex gap-2">
            <span>{data.name}</span>
            <span>&bull;</span>
            <span>{data.integrationUri}</span>
          </div>
          <p>{JSON.stringify(data)}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={updateIntegration.isPending}
        >
          {updateIntegration.isPending ? "Updating..." : "Update"}
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
        <IntegrationCreateModal
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
