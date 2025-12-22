"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { AlertCircleIcon, Copy, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityList,
  EntityPagination,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Apikey } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import {
  useCreateApiToken,
  useRemoveApiToken,
  useSuspenseApiTokens,
} from "../hooks/use-user";
import { useApiTokenParams } from "../hooks/use-user-params";
import { type ApiTokenFormValues, apiTokenInputSchema } from "../types";

export const ApiTokensSearch = () => {
  const [params, setParams] = useApiTokenParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search api tokens"
    />
  );
};

export const ApiTokensList = () => {
  const tokens = useSuspenseApiTokens();

  return (
    <EntityList
      items={tokens.data.items}
      getKey={(token) => token.id}
      renderItem={(token) => <ApiTokenItem data={token} />}
      emptyView={<ApiTokensEmpty />}
    />
  );
};

const ApiTokenSuccessModal = ({
  open,
  setOpen,
  apiKey,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  apiKey?: Apikey;
}) => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  if (!apiKey) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Created API Token</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <FormItem>
            <Label>Name</Label>
            <Input type="text" value={apiKey.name || ""} readOnly={true} />
          </FormItem>
          <FormItem>
            <Label>Token</Label>
            <div className="flex gap-2">
              <Input
                type={visible ? "text" : "password"}
                value={apiKey.key}
                readOnly={true}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    onClick={() => setVisible(!visible)}
                    aria-label={visible ? "Hide token" : "Show token"}
                  >
                    {visible ? <EyeIcon /> : <EyeOffIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Visibility</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleCopy}>
                    <Copy />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? "Copied!" : "Click to copy"}
                </TooltipContent>
              </Tooltip>
            </div>
          </FormItem>
        </div>
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>
            This is the only time you will be able to view this token.
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
};

const ApiTokenCreateModal = ({
  form,
  handleCreate,
  open,
  setOpen,
}: {
  form: UseFormReturn<ApiTokenFormValues>;
  handleCreate: (values: ApiTokenFormValues) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const onSubmit = (values: ApiTokenFormValues) => {
    handleCreate(values);
    setOpen(false);
  };

  const isPending = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create API Token</DialogTitle>
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
                      <Input type="text" placeholder="Token name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires In</FormLabel>
                    <Select
                      value={
                        field.value === undefined
                          ? "undefined"
                          : String(field.value)
                      }
                      onValueChange={(val: string) => {
                        if (val === "undefined") {
                          field.onChange(undefined);
                          return;
                        }

                        const n = parseInt(val, 10);
                        field.onChange(Number.isNaN(n) ? undefined : n);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an expiration option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Expires in</SelectLabel>
                          <SelectItem value={(60 * 60 * 24).toString()}>
                            1 Day
                          </SelectItem>
                          <SelectItem value={(60 * 60 * 24 * 7).toString()}>
                            7 Days
                          </SelectItem>
                          <SelectItem value={(60 * 60 * 24 * 90).toString()}>
                            90 Days
                          </SelectItem>
                          <SelectItem value="undefined">Never</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isPending}>
                Create API Token
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export const ApiTokensHeader = ({ disabled }: { disabled?: boolean }) => {
  const createApiToken = useCreateApiToken();

  const [open, setOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [key, setKey] = useState<Apikey | undefined>(undefined);

  const form = useForm<ApiTokenFormValues>({
    resolver: zodResolver(apiTokenInputSchema),
    defaultValues: {
      name: "",
      expiresIn: undefined,
    },
  });

  const handleCreate = (token: ApiTokenFormValues) => {
    createApiToken.mutate(token, {
      onSuccess: (data) => {
        setKey(data);
        setOpen(false);
        setSuccessOpen(true);
      },
      onError: (error) => {
        setOpen(true);
        toast.error(
          error instanceof Error ? error.message : "Failed to create API token",
        );
      },
    });
  };

  return (
    <>
      <EntityHeader
        title="API Tokens"
        description="Manage API tokens"
        onNew={() => setOpen(true)}
        newButtonLabel="New Token"
        disabled={disabled}
        isCreating={createApiToken.isPending}
      />
      <ApiTokenCreateModal
        form={form}
        open={open}
        setOpen={setOpen}
        handleCreate={handleCreate}
      />
      <ApiTokenSuccessModal
        open={successOpen}
        setOpen={setSuccessOpen}
        apiKey={key}
      />
    </>
  );
};

export const ApiTokensPagination = () => {
  const tokens = useSuspenseApiTokens();
  const [params, setParams] = useApiTokenParams();

  return (
    <EntityPagination
      disabled={tokens.isFetching}
      totalPages={tokens.data.totalPages}
      page={tokens.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const ApiTokensContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<ApiTokensHeader />}
      search={<ApiTokensSearch />}
      pagination={<ApiTokensPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const ApiTokensLoading = () => {
  return <LoadingView message="Loading API tokens..." />;
};

export const ApiTokensError = () => {
  return <ErrorView message="Error loading API tokens" />;
};

export const ApiTokensEmpty = () => {
  return <EmptyView message="No API tokens" />;
};

export const ApiTokenItem = ({ data }: { data: Apikey }) => {
  const removeApiToken = useRemoveApiToken();

  const handleRemove = () => {
    removeApiToken.mutate({ id: data.id });
  };

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex gap-2">
          <span>{data.name}</span>
          <span>&bull;</span>
          <span className="font-mono text-sm px-2 py-1 bg-accent rounded-md flex items-center gap-1">
            {data.start}
            {"*".repeat(22)}
          </span>
        </div>

        <div className="text-xs text-muted-foreground mt-4">
          Created {formatDistanceToNow(data.createdAt, { addSuffix: true })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Last used{" "}
          {data.lastRequest
            ? formatDistanceToNow(data.lastRequest, { addSuffix: true })
            : "Never"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Expires{" "}
          {data.expiresAt
            ? formatDistanceToNow(data.expiresAt, { addSuffix: true })
            : "Never"}
        </div>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleRemove}
        disabled={removeApiToken.isPending}
      >
        {removeApiToken.isPending ? "Revoking..." : "Revoke"}
      </Button>
    </div>
  );
};
