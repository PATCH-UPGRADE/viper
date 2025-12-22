"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleX } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
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
import type { Asset, Vulnerability } from "@/generated/prisma";
import { cpeSchema } from "@/lib/schemas";
import { DeviceIconType, getIconByType } from "../types";
import type { AssetNodeData } from "./node";

const formSchema = z.object({
  icon: z.string(),
  label: z.string(),
  description: z.string().optional(),
  cpes: z
    .array(z.object({ value: cpeSchema }))
    .default([])
    .optional(),
  assetIds: z
    .array(z.object({ value: z.string() }))
    .default([])
    .optional(),
});
export type AssetFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  defaultValues?: AssetNodeData;
  assets: Asset[];
  vulnerabilities: Vulnerability[];
}

export const AssetDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  assets = [],
  vulnerabilities = [],
}: Props) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      icon: defaultValues.icon ?? "",
      label: defaultValues.label ?? "",
      description: defaultValues.description ?? "",
      cpes: defaultValues.cpes?.map((cpe) => ({ value: cpe })) ?? [],
      assetIds: defaultValues.assetIds?.map((id) => ({ value: id })) ?? [],
    },
  });

  // Reset form values when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        icon: defaultValues.icon ?? "",
        label: defaultValues.label ?? "",
        description: defaultValues.description ?? "",
        cpes: defaultValues.cpes?.map((cpe) => ({ value: cpe })) ?? [],
        assetIds: defaultValues.assetIds?.map((id) => ({ value: id })) ?? [],
      });
    }
  }, [open, defaultValues, form]);

  const {
    fields: cpeFields,
    append: cpeAppend,
    remove: cpeRemove,
  } = useFieldArray({
    name: "cpes",
    control: form.control,
  });

  const {
    fields: assetIdFields,
    append: assetAppend,
    remove: assetRemove,
  } = useFieldArray({
    name: "assetIds",
    control: form.control,
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-auto max-h-full max-w-[75%]!">
        <DialogHeader>
          <DialogTitle>Device Node</DialogTitle>
          <DialogDescription>
            Configure which devices are linked to this node
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(DeviceIconType).map((icon) => {
                          const Icon = getIconByType(icon);
                          return (
                            <SelectItem value={icon} key={icon}>
                              <Icon /> {icon}
                            </SelectItem>
                          );
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
                      <Input placeholder="Infusion Pump" {...field} />
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
                <p className="text-sm text-muted-foreground">
                  Match devices based on cpes, or manually specify them.
                </p>
                <div className="mt-4">
                  <h3 className="text-sm font-medium">CPEs</h3>

                  {cpeFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Add a CPE pattern to match assets to
                    </p>
                  )}

                  <div className="space-y-2 mt-2">
                    {cpeFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-start">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => cpeRemove(index)}
                          aria-label={`Remove CPE ${index + 1}`}
                        >
                          <CircleX />
                        </Button>
                        <FormField
                          control={form.control}
                          name={`cpes.${index}.value`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="sr-only">
                                CPE {index + 1}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="cpe:2.3:*:*:*:*:*:*:*:*:*:*:*"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => cpeAppend({ value: "" })}
                    >
                      Add CPE
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-medium">Assets</h3>

                  {assetIdFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Add an asset id to match individual assets
                    </p>
                  )}

                  <div className="space-y-2 mt-2">
                    {assetIdFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-start">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => assetRemove(index)}
                          aria-label={`Remove Asset ${index + 1}`}
                        >
                          <CircleX />
                        </Button>
                        <FormField
                          control={form.control}
                          name={`assetIds.${index}.value`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="sr-only">
                                Asset Id {index + 1}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="cmirwmn1f000713yojcsy2ok4"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => assetAppend({ value: "" })}
                    >
                      Add asset ID
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </Form>
          <div>
            <h2 className="font-semibold text-lg">Devices</h2>
            {assets.length > 0 ? (
              <ul className="pl-4">
                {assets.map((asset, idx) => (
                  <li className="list-disc" key={idx}>
                    {asset.role} &bull; {asset.cpe} &bull; {asset.id}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No devices matched/specified</p>
            )}
            <h2 className="font-semibold text-lg mt-4">Vulnerabilities</h2>
            {vulnerabilities.length > 0 ? (
              <ul className="pl-4">
                {vulnerabilities.map((vuln, idx) => (
                  <li className="list-disc" key={idx}>
                    {vuln.description}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No vulnerabilities found that affect these devices</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
