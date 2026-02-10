"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type PropsWithChildren, useState, useCallback, useMemo } from "react";
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
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiTokenSuccessModal } from "@/features/user/components/user";
import {
  type Apikey,
  AuthType,
  type Integration,
  type ResourceType,
} from "@/generated/prisma";
import { usePaginationParams } from "@/lib/pagination";
import {
  useCreateIntegration,
  useRemoveIntegration,
  useRotateIntegration,
  useSuspenseIntegrations,
  useTriggerSync,
  useUpdateIntegration,
} from "../hooks/use-integrations";
import {
  type AuthenticationInputType,
  type IntegrationFormValues,
  integrationInputSchema,
} from "../types";
import { DataTable } from "@/components/ui/data-table";
import { getIntegrationColumns } from "@/features/integrations/components/columns";

export const IntegrationsList = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const { data: integrations, isFetching } =
    useSuspenseIntegrations(resourceType);

  const columns = useMemo(() => {
    return getIntegrationColumns(resourceType);
  }, [resourceType]);

  return (
      <DataTable
        paginatedData={integrations}
        columns={columns}
        isLoading={isFetching}
      />
  );
};

export const IntegrationCreateModal = ({
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
  };

  const isPending = form.formState.isSubmitting;
  const authType = form.watch("authType");
  const isGeneric = form.watch("isGeneric");
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
                        ✨ AI Integration ✨
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

              {isGeneric && (
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Instructions</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

interface RotateIntegrationConfirmModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  handleRotate: () => void;
}

export function RotateIntegrationConfirmModal({
  open,
  setOpen,
  handleRotate,
}: RotateIntegrationConfirmModalProps) {
  const onConfirm = () => {
    handleRotate();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate API Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to rotate this API key? This will invalidate
            the current key and generate a new one. Any applications using the
            old key will need to be updated.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Rotate Key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};

export const IntegrationsEmpty = () => {
  return <EmptyView message="No Integrations" />;
};
