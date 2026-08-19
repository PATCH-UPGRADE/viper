"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { z } from "zod";
import { AuthenticationFields } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import type { PlatformEnum } from "@/generated/prisma";
import { authSchema } from "@/lib/schemas";
import { humanize } from "@/lib/utils";
import { useCreateIntegration } from "../hooks/use-integrations";
import type { FieldSpec } from "../types";

const zodForSpec = (spec: FieldSpec): z.ZodTypeAny => {
  const field =
    spec.kind === "select"
      ? z.enum(spec.options && spec.options.length > 0 ? spec.options : [""])
      : spec.kind === "number"
        ? z.coerce.number()
        : spec.kind === "url"
          ? z.string().url()
          : z.string().min(1);
  return spec.required ? field : field.optional();
};

const shapeFor = (specs: FieldSpec[]) =>
  Object.fromEntries(specs.map((spec) => [spec.key, zodForSpec(spec)]));

const inputTypeFor = (kind: FieldSpec["kind"]) =>
  kind === "number" ? "number" : kind === "password" ? "password" : "text";

const DynamicField = ({
  form,
  name,
  spec,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: field name/path is only known at runtime — same tradeoff as any generic dynamic-schema form.
  form: UseFormReturn<any>;
  name: string;
  spec: FieldSpec;
}) => {
  const label = humanize(spec.key);
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {spec.required ? " *" : ""}
          </FormLabel>
          <FormControl>
            {spec.kind === "select" ? (
              <Select
                value={(field.value as string | undefined) ?? ""}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Select ${label}`} />
                </SelectTrigger>
                <SelectContent>
                  {(spec.options ?? []).map((option) => (
                    <SelectItem value={option} key={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={inputTypeFor(spec.kind)}
                value={(field.value as string | undefined) ?? ""}
                onChange={(e) =>
                  field.onChange(
                    spec.kind === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

interface CreateIntegrationDialogProps {
  platform: PlatformEnum;
  displayName: string;
  configFields: FieldSpec[];
  credentialFields: FieldSpec[];
  credentialsAreAuthShaped: boolean;
}

export const CreateIntegrationDialog = ({
  platform,
  displayName,
  configFields,
  credentialFields,
  credentialsAreAuthShaped,
}: CreateIntegrationDialogProps) => {
  const [open, setOpen] = useState(false);
  const createIntegration = useCreateIntegration();

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, "Name is required"),
        syncEvery: z
          .number()
          .int()
          .positive()
          .min(INTEGRATION_SYNC_EVERY_MIN * 60),
        config: z.object(shapeFor(configFields)),
        credentials: credentialsAreAuthShaped
          ? authSchema
          : z.object(shapeFor(credentialFields)),
      }),
    [configFields, credentialFields, credentialsAreAuthShaped],
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      syncEvery: INTEGRATION_SYNC_EVERY_MIN * 60,
      config: {},
      credentials: credentialsAreAuthShaped ? { authType: "None" } : {},
    } as FormValues,
  });

  const onSubmit = (values: FormValues) => {
    createIntegration.mutate(
      { ...values, platform },
      {
        onSuccess: () => {
          form.reset();
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> Add
      </Button>
      <DialogContent className="p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b gap-1">
          <DialogTitle className="text-xl">Add {displayName}</DialogTitle>
          <DialogDescription>
            Connect a new {displayName} integration.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            id="create-integration-form"
            className="px-6 py-4 max-h-[60vh] overflow-y-auto grid gap-6"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Integration Name *</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder={displayName} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {configFields.map((spec) => (
              <DynamicField
                key={spec.key}
                form={form}
                name={`config.${spec.key}`}
                spec={spec}
              />
            ))}

            <FormField
              control={form.control}
              name="syncEvery"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sync Interval (seconds) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        field.onChange(
                          Number.isNaN(value)
                            ? INTEGRATION_SYNC_EVERY_MIN * 60
                            : value,
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {credentialsAreAuthShaped ? (
              <AuthenticationFields form={form} name="credentials" />
            ) : (
              credentialFields.map((spec) => (
                <DynamicField
                  key={spec.key}
                  form={form}
                  name={`credentials.${spec.key}`}
                  spec={spec}
                />
              ))
            )}
          </form>
        </Form>
        <DialogFooter className="px-6 py-4 bg-muted border-t justify-between!">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            form="create-integration-form"
            disabled={createIntegration.isPending}
          >
            Create Integration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
