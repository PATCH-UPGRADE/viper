"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DeviceIconType, getIconByType } from "../types";

const formSchema = z.object({
  icon: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  cpes: z.array(z.string()).optional(),
  assetIds: z.array(z.string()).optional()
});
export type AssetFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  defaultValues?: Partial<AssetFormValues>;
}

export const AssetDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      icon: defaultValues.icon || undefined,
      label: defaultValues.label || "",
      description: defaultValues.description || "",
      cpes: defaultValues.cpes || [],
      assetIds: defaultValues.assetIds || [],
    },
  });

  // Reset form values when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        icon: defaultValues.icon || undefined,
        label: defaultValues.label || "",
        description: defaultValues.description || "",
        cpes: defaultValues.cpes || [],
        assetIds: defaultValues.assetIds || [],
      });
    }
  }, [open, defaultValues, form]);

  /*const watchMethod = form.watch("method");
  const showBodyField = ["POST", "PUT", "PATCH"].includes(watchMethod);*/

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Device Node</DialogTitle>
          <DialogDescription>
            Configure which devices are linked to this node 
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8 mt-4"
          >
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={defaultValues.icon}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(DeviceIconType).map((icon) => {
                        const Icon = getIconByType(icon);
                        return (
                        <SelectItem value={icon}><Icon /> {icon}</SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Infusion Pump"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Delivers fluids to the patient during the blooddraw workflow"
                      className="min-h-[120px] font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    How are these devices used during the clinical workflow?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <h2 className="font-semibold">Devices</h2>
              <p className="text-sm text-muted-foreground">Match devices based on cpes, or manually specify them.</p>
            </div>
            <p>TODO: list of cpe inputs, where you can choose to add more of them or not</p>
            <p>TODO: some way to select assets from a table?</p>
            <DialogFooter className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
