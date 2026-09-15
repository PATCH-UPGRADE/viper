"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import { authSchema } from "@/lib/schemas";
import { humanize } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import {
  useCreateIntegration,
  useUpdateIntegration,
} from "../hooks/use-integrations";
import type { FieldSpec, IntegrationListItem } from "../types";

const zodForSpec = (spec: FieldSpec): z.ZodTypeAny => {
  const field =
    spec.kind === "select"
      ? z.enum(spec.options && spec.options.length > 0 ? spec.options : [""])
      : spec.kind === "number"
        ? z.coerce.number()
        : spec.kind === "url"
          ? z.string().url()
          : spec.required
            ? z.string().min(1)
            : z.string();
  return spec.required ? field : field.optional();
};

export const shapeFor = (specs: FieldSpec[]) =>
  Object.fromEntries(specs.map((spec) => [spec.key, zodForSpec(spec)]));

/** Edit mode never shows stored credentials, so every credential field must be fillable-or-blank. */
export const relaxedShapeFor = (specs: FieldSpec[]) =>
  shapeFor(specs.map((spec) => ({ ...spec, required: false })));

/** `authSchema` minus its "authentication required unless None" refinement — the shape alone already has `authentication` optional. */
export const relaxedAuthSchema = z.object(authSchema.shape);

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
                type={
                  spec.kind === "number" || spec.kind === "password"
                    ? spec.kind
                    : "text"
                }
                value={(field.value as string | undefined) ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

type Mode = "create" | "edit";

export const IntegrationFormDialog = ({
  entry,
  mode,
  open,
  onOpenChange,
  integration,
}: {
  entry: CatalogEntry;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration?: IntegrationListItem;
}) => {
  const {
    platform,
    displayName,
    configFields,
    credentialFields,
    credentialsAreAuthShaped,
  } = entry;
  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const mutation = mode === "create" ? createIntegration : updateIntegration;

  const shapeForFields = mode === "edit" ? relaxedShapeFor : shapeFor;
  const authSchemaToUse = mode === "edit" ? relaxedAuthSchema : authSchema;
  const credentialsSchema = credentialsAreAuthShaped
    ? authSchemaToUse
    : z.object(shapeForFields(credentialFields));

  const copy =
    mode === "edit"
      ? {
          title: `Edit ${displayName}`,
          description: "Leave credential fields blank to keep them unchanged.",
          submit: "Save Changes",
        }
      : {
          title: `Add ${displayName}`,
          description: `Connect a new ${displayName} integration.`,
          submit: "Create Integration",
        };

  const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    syncEvery: z
      .number()
      .int()
      .positive()
      .min(INTEGRATION_SYNC_EVERY_MIN * 60),
    config: z.object(shapeFor(configFields)),
    credentials: credentialsSchema,
  });

  type FormValues = z.infer<typeof formSchema>;

  const defaultValues = {
    name: integration?.name ?? "",
    syncEvery: integration?.syncEvery ?? INTEGRATION_SYNC_EVERY_MIN * 60,
    config: integration?.config ?? {},
    // Credentials always start blank — the user must never see stored values.
    credentials: credentialsAreAuthShaped ? { authType: "None" } : {},
  } as FormValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Re-seed the form from the current row each time the dialog opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run on open/close, not on every defaultValues/form identity change.
  useEffect(() => {
    if (open) form.reset(defaultValues);
  }, [open]);

  const onSubmit = (values: FormValues) => {
    const onSuccess = () => {
      form.reset();
      onOpenChange(false);
    };

    if (mode === "create") {
      createIntegration.mutate({ ...values, platform }, { onSuccess });
      return;
    }
    if (!integration) return;
    // Only send credentials if the user actually touched them — otherwise
    // the stored value must stay as-is (see credentialsPatch in the router).
    const { credentials: _credentials, ...rest } = values;
    const data = form.formState.dirtyFields.credentials ? values : rest;
    updateIntegration.mutate(
      { id: integration.id, data: { ...data, platform } },
      { onSuccess },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b gap-1">
          <DialogTitle className="text-xl">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            id={`integration-form-${mode}`}
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
                      onChange={(e) =>
                        field.onChange(
                          Number(e.target.value) ||
                            INTEGRATION_SYNC_EVERY_MIN * 60,
                        )
                      }
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
            form={`integration-form-${mode}`}
            disabled={mutation.isPending}
          >
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CreateIntegrationDialog = ({ entry }: { entry: CatalogEntry }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> Add
      </Button>
      <IntegrationFormDialog
        entry={entry}
        mode="create"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};
