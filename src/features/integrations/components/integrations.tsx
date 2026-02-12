"use client";

import { DialogClose } from "@radix-ui/react-dialog";
import {
  AlertCircleIcon,
  CircleCheck,
  CircleDot,
  CircleX,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { AuthenticationFields } from "@/components/auth-form";
import {
  EmptyView,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { getIntegrationColumns } from "@/features/integrations/components/columns";
import type { ResourceType, SyncStatusEnum } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { usePaginationParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import type { IntegrationFormValues } from "../types";

export const IntegrationsSearch = () => {
  const [params, setParams] = usePaginationParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search integrations by name"
    />
  );
};

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
      search={<IntegrationsSearch />}
      paginatedData={integrations}
      columns={columns}
      isLoading={isFetching}
    />
  );
};

export const SyncStatusIndicator = ({
  status,
}: {
  status?: SyncStatusEnum;
}) => {
  const className = "flex gap-1 items-center font-semibold";
  switch (status) {
    case "Error":
      return (
        <span className={cn(className, "text-destructive")}>
          <CircleX size={15} /> Error
        </span>
      );
    case "Success":
      return (
        <span className={cn(className, "text-emerald-600")}>
          <CircleCheck size={15} /> Success
        </span>
      );
    default:
      return (
        <span className={cn(className, "text-gray-500")}>
          <CircleDot size={15} /> Pending
        </span>
      );
  }
};

export const IntegrationCreateModal = ({
  form,
  handleCreate,
  open,
  setOpen,
  isUpdate,
  resourceType,
}: {
  form: UseFormReturn<IntegrationFormValues>;
  handleCreate: (values: IntegrationFormValues) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  resourceType?: ResourceType;
  isUpdate?: boolean;
}) => {
  const onSubmit = (values: IntegrationFormValues) => {
    handleCreate(values);
  };

  const isPending = form.formState.isSubmitting;
  const isGeneric = form.watch("isGeneric");
  const verbLabel = isUpdate ? "Update" : "Create";
  const label = `${verbLabel} ${!isUpdate ? "New" : ""} ${resourceType || ""} Integration`;

  const integrationTypes = [
    {
      value: false,
      id: "standard",
      title: "Standard Integration",
      description: "Pre-configured platforms with built-in support",
      badge: "e.g., BlueFlow, Helm",
      icon: null,
    },
    {
      value: true,
      id: "ai",
      title: "AI Integration",
      description: "Flexible setup for any custom platform",
      badge: "Universal & Adaptive",
      icon: <Sparkles size={15} />,
    },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 rounded-2xl w-6xl lg:max-w-2xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b gap-1">
          <DialogTitle className="text-xl">{label}</DialogTitle>
          <DialogDescription>
            Connect a standard integration or use AI to sync with any platform
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="integration-form" className="px-6">
            <div className="no-scrollbar -mx-6 px-6 py-4 max-h-[60vh] overflow-y-auto grid gap-6">
              <FormField
                control={form.control}
                name="isGeneric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Integration Type *</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) =>
                          field.onChange(value === "true")
                        }
                        value={field.value ? "true" : "false"}
                        className="grid grid-cols-2 gap-4"
                      >
                        {integrationTypes.map((type) => {
                          const isSelected = field.value === type.value;

                          return (
                            <FormItem key={type.id}>
                              <FormControl>
                                <RadioGroupItem
                                  value={String(type.value)}
                                  id={type.id}
                                  className="sr-only"
                                />
                              </FormControl>
                              <FormLabel
                                htmlFor={type.id}
                                className={cn(
                                  "flex flex-col cursor-pointer rounded-lg border-2 p-6 hover:border-primary/50 transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border",
                                )}
                              >
                                <div className="flex items-start gap-3 mb-3">
                                  <div
                                    className={cn(
                                      "w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5",
                                      isSelected
                                        ? "border-primary"
                                        : "border-muted-foreground",
                                    )}
                                  >
                                    {isSelected && (
                                      <div className="w-3 h-3 rounded-full bg-primary" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-md font-semibold mb-2 flex gap-1">
                                      {type.icon}
                                      {type.title}
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-3">
                                      {type.description}
                                    </div>
                                    <Badge className="text-xs">
                                      {type.badge}
                                    </Badge>
                                  </div>
                                </div>
                              </FormLabel>
                            </FormItem>
                          );
                        })}
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />
              {isGeneric && (
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertCircleIcon className="stroke-blue-900" />
                  <AlertDescription className="text-blue-900">
                    <strong>AI-generated integrations:</strong> While our AI
                    does its best to understand and sync with your platform, we
                    recommend verifying synced data for accuracy.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Integration Name *</FormLabel>
                    <FormDescription>
                      How this integration will appear in the platform
                    </FormDescription>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Hospital Asset Inventory"
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
                    <FormLabel>Integration URL *</FormLabel>
                    <FormDescription>
                      API endpoint for the integration
                    </FormDescription>
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
                name="syncEvery"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sync Interval (seconds) *</FormLabel>
                    <FormDescription>
                      How often to synchronize with the integration
                    </FormDescription>
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
                    <FormDescription>Minimum: 60 seconds</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isGeneric && (
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Additional Instructions{" "}
                        <span className="text-muted-foreground">
                          (Optional)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Provide any additional context, access instructions, or special considerations for the AI to understand your integration"
                          rows={4}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </form>
        </Form>
        <DialogFooter className="px-6 py-4 bg-muted border-t justify-between!">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            form="integration-form"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isPending}
          >
            {verbLabel} Integration
          </Button>
        </DialogFooter>
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

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};

export const IntegrationsEmpty = () => {
  return <EmptyView message="No Integrations" />;
};
