"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { ApiTokenSuccessModal } from "@/features/user/components/user";
import { type Apikey, AuthType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { useCreateIntegration } from "../hooks/use-integrations";
import {
  type IntegrationFormValues,
  integrationInputSchema,
  integrationsMapping,
  isValidIntegrationKey,
} from "../types";
import { IntegrationCreateModal } from "./integrations";

export const IntegrationsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const pathTab = pathname.split("/").pop() || "assets";
  const activeTab = isValidIntegrationKey(pathTab) ? pathTab : "assets";

  const createIntegration = useCreateIntegration();
  const [open, setOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [key, setKey] = useState<Apikey | undefined>(undefined);

  const resourceType = integrationsMapping[activeTab].type;
  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationInputSchema),
    defaultValues: {
      name: "",
      resourceType,
      isGeneric: false,
      syncEvery: 300,
      authType: AuthType.None,
    },
  });

  useEffect(() => {
    form.setValue("resourceType", resourceType);
  }, [resourceType, form]);

  const handleCreate = (item: IntegrationFormValues) => {
    createIntegration.mutate(item, {
      onSuccess: (data) => {
        setOpen(false);
        setKey(data.apiKey);
        setSuccessOpen(true);
      },
      onError: () => {
        setOpen(true);
      },
    });
  };

  return (
    <>
      <div className={cn(mainPadding, "bg-background flex flex-col gap-4")}>
        <SettingsSubheader
          title="Integrations"
          description="Manage external integrations to sync assets and vulnerabilities"
        />

        <Tabs
          value={activeTab}
          className="w-full flex flex-row! justify-between"
        >
          <TabsList variant="line">
            {Object.entries(integrationsMapping).map(([key, value]) => (
              <TabsTrigger value={key} key={key} asChild>
                <Link
                  href={`/settings/integrations/${key}`}
                  className="data-[state=active]:text-primary!  [&[data-state=active]]:after:bg-primary!"
                >
                  {value.name} Integrations
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
          <Button onClick={() => setOpen(true)}>
            <PlusIcon /> New {resourceType} Integration
          </Button>
        </Tabs>
      </div>

      <div className={mainPadding}>{children}</div>

      <IntegrationCreateModal
        resourceType={resourceType}
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
