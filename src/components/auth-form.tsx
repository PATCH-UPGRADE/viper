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

export const AuthenticationFields = <TFieldValues extends FieldValues>({
  form,
  name,
}: AuthenticationFieldsProps<TFieldValues>) => {
  const path = (field: string) =>
    (name ? `${name}.${field}` : field) as Path<TFieldValues>;

  const authType = form.watch(path("authType")) as AuthType;

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
                  <Input type="text" placeholder="Username" {...field} />
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
                  <Input type="password" placeholder="Password" {...field} />
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
                <Input type="password" placeholder="Bearer token" {...field} />
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
                  <Input type="text" placeholder="X-API-Key" {...field} />
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
                  <Input type="text" placeholder="Header value" {...field} />
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
