import { useEffect } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
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
import { AuthType } from "@/generated/prisma";

interface AuthenticationFieldsProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  name?: string;
}

/** Which authentication.* leaves belong to each auth type. */
const AUTH_TYPE_FIELDS: Partial<Record<AuthType, string[]>> = {
  Basic: ["username", "password"],
  Bearer: ["token"],
  Header: ["header", "value"],
};

export const AuthenticationFields = <TFieldValues extends FieldValues>({
  form,
  name,
}: AuthenticationFieldsProps<TFieldValues>) => {
  const path = (field: string) =>
    (name ? `${name}.${field}` : field) as Path<TFieldValues>;

  const authType = form.watch(path("authType")) as AuthType;

  // A field left `undefined` (never typed into) fails authenticationSchema's
  // union even though a blank "" for the same field passes it — seed only
  // the active type's own fields, and only when unset, so a value typed
  // before switching away and back is never overwritten.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when authType itself changes.
  useEffect(() => {
    const activeFields = new Set(AUTH_TYPE_FIELDS[authType] ?? []);
    for (const field of Object.values(AUTH_TYPE_FIELDS).flat()) {
      const fieldPath = path(`authentication.${field}`);
      if (activeFields.has(field)) {
        if (form.getValues(fieldPath) === undefined) {
          form.setValue(fieldPath, "" as never);
        }
      } else if (
        !form.getFieldState(fieldPath, form.formState).isDirty &&
        form.getValues(fieldPath) !== undefined
      ) {
        // A same-named leaf from a type the user isn't on right now and
        // never actually typed into — clear it. Left as "" it would
        // structurally satisfy that other type's schema too, and the
        // union in authenticationSchema resolves to whichever declared
        // variant matches first, silently dropping the real value.
        form.setValue(fieldPath, undefined as never);
      }
    }
  }, [authType]);

  return (
    <>
      <FormField
        control={form.control}
        name={path("authType")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authentication Type *</FormLabel>
            <FormDescription>
              Authentication method for API access
            </FormDescription>
            <Select
              value={field.value as AuthType}
              onValueChange={field.onChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select authentication type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Authentication Type</SelectLabel>
                  {Object.values(AuthType).map((authType) => (
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
            name={path("authentication.username")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username *</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Username"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={path("authentication.password")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password *</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Password"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
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
          name={path("authentication.token")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token *</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Bearer token"
                  {...field}
                  value={(field.value as string | undefined) ?? ""}
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
            name={path("authentication.header")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Header Name *</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="X-API-Key"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={path("authentication.value")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Header Value *</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Header value"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </>
  );
};
