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
import { authenticationSchema, authSchema } from "@/lib/schemas";
import { humanize } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import {
  useCreateIntegration,
  useUpdateIntegration,
} from "../hooks/use-integrations";
import type { FieldSpec, IntegrationListItem } from "../types";
import { CREDENTIAL_PLACEHOLDER } from "../types";

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

/** Every field name any auth variant (Basic/Bearer/Header) uses — derived from the schema itself so a new variant can't silently go unplaceholdered. Object.fromEntries below doesn't care if a name repeats across variants. */
const AUTH_FIELD_KEYS = authenticationSchema.options.flatMap((variant) =>
  Object.keys(variant.shape),
);

/** Placeholder-filled `credentials` default for the edit form — every field renders as dots and passes "required" validation unchanged, per CREDENTIAL_PLACEHOLDER's contract. */
const placeholderCredentials = (
  credentialsAreAuthShaped: boolean,
  credentialFields: FieldSpec[],
) =>
  credentialsAreAuthShaped
    ? {
        authType: "None",
        authentication: Object.fromEntries(
          AUTH_FIELD_KEYS.map((key) => [key, CREDENTIAL_PLACEHOLDER]),
        ),
      }
    : Object.fromEntries(
        credentialFields.map((spec) => [spec.key, CREDENTIAL_PLACEHOLDER]),
      );

type DirtyFields = Record<string, unknown> | boolean | undefined;

const dirtyLeaf = (dirty: unknown, value: unknown) =>
  Boolean(dirty) && value !== CREDENTIAL_PLACEHOLDER;

/**
 * The partial credentials payload for an edit submission: only leaf fields
 * the user actually changed — dirty and no longer the placeholder — plus
 * `authType` whenever it's dirty (structural: the server needs it to know
 * which shape the dirty leaf fields belong to, even though it isn't itself
 * a "value" the way a password field is). Returns undefined when nothing
 * was touched, so `credentials` is omitted from the payload entirely and
 * the router's "omitted = keep what's stored" contract applies.
 */
export const buildCredentialsPatch = (
  credentialsAreAuthShaped: boolean,
  dirtyFields: DirtyFields,
  values: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (typeof dirtyFields !== "object" || !dirtyFields) return undefined;

  if (!credentialsAreAuthShaped) {
    const patch = Object.fromEntries(
      Object.entries(dirtyFields)
        .filter(([key, dirty]) => dirtyLeaf(dirty, values[key]))
        .map(([key]) => [key, values[key]]),
    );
    return Object.keys(patch).length > 0 ? patch : undefined;
  }

  const authDirty = (dirtyFields.authentication ?? {}) as Record<
    string,
    unknown
  >;
  const authValue = (values.authentication ?? {}) as Record<string, unknown>;
  const authPatch = Object.fromEntries(
    Object.entries(authDirty)
      .filter(([key, dirty]) => dirtyLeaf(dirty, authValue[key]))
      .map(([key]) => [key, authValue[key]]),
  );
  if (!dirtyFields.authType && Object.keys(authPatch).length === 0) {
    return undefined;
  }
  return {
    authType: values.authType,
    ...(Object.keys(authPatch).length > 0 && { authentication: authPatch }),
  };
};

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

  // Unchanged between modes — every credential field always has a value
  // (real, on create; the placeholder, on edit), so "required" validation
  // applies the same way in both.
  const credentialsSchema = credentialsAreAuthShaped
    ? authSchema
    : z.object(shapeFor(credentialFields));

  const [title, description, submitLabel] =
    mode === "edit"
      ? [
          `Edit ${displayName}`,
          "Credential fields show placeholder dots — only fields you change are updated.",
          "Save Changes",
        ]
      : [
          `Add ${displayName}`,
          `Connect a new ${displayName} integration.`,
          "Create Integration",
        ];

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
    // Create starts genuinely empty; edit never shows the stored value, so
    // every field starts at the placeholder instead (dots, passes
    // validation, excluded from the patch unless the user changes it).
    credentials:
      mode === "edit"
        ? placeholderCredentials(credentialsAreAuthShaped, credentialFields)
        : credentialsAreAuthShaped
          ? { authType: "None" }
          : {},
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
    if (mode === "create") {
      createIntegration.mutate(
        { ...values, platform },
        {
          // Blank the form back out — ready for the next "Add" — rather
          // than for edit mode, where reset() with no args would snap the
          // fields back to the stale pre-edit snapshot during the close
          // animation instead of what was just saved.
          onSuccess: () => {
            form.reset();
            onOpenChange(false);
          },
        },
      );
      return;
    }
    if (!integration) return;
    const onSuccess = () => onOpenChange(false);
    // Only send credentials/syncEvery the user actually touched — leaving
    // either `undefined` here passes zod's `.optional()` the same as an
    // absent key, and the router reads that as "keep what's stored"
    // (including a `null` "inherit platform default" syncEvery, and merges
    // the credentials patch into what's already there — see mergeCredentialPatch).
    const data = {
      ...values,
      credentials: buildCredentialsPatch(
        credentialsAreAuthShaped,
        form.formState.dirtyFields.credentials as DirtyFields,
        values.credentials as Record<string, unknown>,
      ),
      syncEvery: form.formState.dirtyFields.syncEvery
        ? values.syncEvery
        : undefined,
    };
    updateIntegration.mutate(
      { id: integration.id, data: { ...data, platform } },
      { onSuccess },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b gap-1">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            {submitLabel}
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
