import { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { integrationInputSchema } from "@/features/integrations/types";
import { AuthType } from "@/generated/prisma";

// Extract just the authentication-related fields from your schema
export type AuthenticationFormValues = Pick<
  z.infer<typeof integrationInputSchema>,
  "authType" | "authentication"
>;

interface AuthenticationFieldsProps {
  form: UseFormReturn<AuthenticationFormValues>;
}

export const AuthenticationFields = ({ form }: AuthenticationFieldsProps) => {
  const authType = form.watch("authType");

  return (
    <>
      <FormField
        control={form.control}
        name="authType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authentication Type *</FormLabel>
            <FormDescription>
              Authentication method for API access
            </FormDescription>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select authentication type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Authentication Type</SelectLabel>
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
            name="authentication.password"
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
          name="authentication.token"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token *</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Bearer token" {...field} />
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
            name="authentication.value"
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
