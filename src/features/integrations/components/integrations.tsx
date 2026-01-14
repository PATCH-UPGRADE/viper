"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { AlertCircleIcon, Copy, EyeIcon, EyeOffIcon } from "lucide-react";
import { PropsWithChildren, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityList,
  EntityPagination,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Apikey, Integration, ResourceType } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { handleCopy } from "@/lib/copy";
import {
  useSuspenseIntegrations,
} from "../hooks/use-integrations";
import { usePaginationParams } from "@/lib/pagination";
//import { useApiTokenParams } from "../hooks/use-user-params";
//import { type ApiTokenFormValues, apiTokenInputSchema } from "../types";

export const IntegrationsList = ({resourceType}: {resourceType: ResourceType}) => {
  const integrations = useSuspenseIntegrations(resourceType);

  return (
    <EntityList
      items={integrations.data.items}
      getKey={(token) => token.id}
      renderItem={(integration) => <IntegrationItem data={integration} />}
      emptyView={<IntegrationsEmpty />}
    />
  );
};

export const IntegrationsHeader = ({resourceType}: {resourceType: ResourceType}) => {
  //const createApiToken = useCreateApiToken();

  return (
      <EntityHeader
        title={`${resourceType} Integrations`}
        description="Manage Integrations"
      />
  );
};

export const IntegrationsPagination = ({resourceType}: {resourceType: ResourceType}) => {
  const items = useSuspenseIntegrations(resourceType);
  const [params, setParams] = usePaginationParams();

  return (
    <EntityPagination
      disabled={items.isFetching}
      totalPages={items.data.totalPages}
      page={items.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
}

export const IntegrationsContainer = ({
  resourceType, children
}: PropsWithChildren<{
  resourceType: ResourceType;
}>) => {
  return (
    <EntityContainer
      header={<IntegrationsHeader resourceType={resourceType} />}
      pagination={<IntegrationsPagination resourceType={resourceType} />}
    >
      {children}
    </EntityContainer>
  );
};

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};

export const IntegrationsEmpty = () => {
  return <EmptyView message="No Integrations" />;
};

export const IntegrationItem = ({ data }: { data: Integration }) => {
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex gap-2">
          <span>{data.name}</span>
          <span>&bull;</span>
          <span>{data.integrationUri}</span>
        </div>
        <p>{JSON.stringify(data)}</p>
      </div>
    </div>
  );
};
