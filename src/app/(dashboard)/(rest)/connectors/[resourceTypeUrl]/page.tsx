"use client";

import { notFound, usePathname } from "next/navigation";
import { ConnectorsList } from "@/features/api-key-connectors/components/connectors";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";

const Page = () => {
  const pathname = usePathname();
  const resourceTypePlural = pathname.split("/").pop();

  if (!resourceTypePlural || !isValidResourceTypeKey(resourceTypePlural)) {
    return notFound();
  }

  const resourceType = integrationsMapping[resourceTypePlural].type;

  return <ConnectorsList resourceType={resourceType} />;
};

export default Page;
