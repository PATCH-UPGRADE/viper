"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { Apikey, AuthType, ResourceType } from "@/generated/prisma";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IntegrationFormValues,
  integrationInputSchema,
  integrationsMapping,
} from "../types";
import { Button } from "@/components/ui/button";
import { useCreateIntegration } from "../hooks/use-integrations";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IntegrationCreateModal } from "./integrations";
import { ApiTokenSuccessModal } from "@/features/user/components/user";
import { PlusIcon } from "lucide-react";

export const IntegrationsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const activeTab = pathname.split("/").pop() || "assets";

  const createIntegration = useCreateIntegration();
  const [open, setOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [key, setKey] = useState<Apikey | undefined>(undefined);

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationInputSchema),
    defaultValues: {
      name: "",
      resourceType: "Asset", // TODO: resourceType,
      isGeneric: false,
      syncEvery: 300,
      authType: AuthType.None,
    },
  });

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
    <div>
      <SettingsSubheader
        title="Integrations"
        description="Manage external integrations to sync assets and vulnerabilities"
      />

      <Tabs value={activeTab} className="w-full">
        <TabsList variant="line">
          {Object.entries(integrationsMapping).map(([key, value]) => (
            <TabsTrigger value={key} key={key} asChild>
              <Link href={`/settings/integrations/${key}`}>
                {value.name} Integrations
              </Link>
            </TabsTrigger>
          ))}
          <Button onClick={() => setOpen(true)}><PlusIcon /> New Integration</Button>
        </TabsList>
      </Tabs>

      <div className="mt-6">{children}</div>

      <IntegrationCreateModal
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
    </div>
  );
};
