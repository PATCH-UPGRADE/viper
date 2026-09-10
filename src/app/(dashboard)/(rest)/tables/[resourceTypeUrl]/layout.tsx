import { notFound } from "next/navigation";
import { EntityHeader } from "@/components/entity-components";
import { mainPadding } from "@/config/constants";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";
import type { ChildrenProps, DynamicPageProps } from "@/lib/page-types";
import { cn } from "@/lib/utils";

const Layout = async ({
  children,
  params,
}: ChildrenProps & DynamicPageProps<"resourceTypeUrl">) => {
  const { resourceTypeUrl } = await params;

  if (!isValidResourceTypeKey(resourceTypeUrl)) {
    return notFound();
  }

  const { name } = integrationsMapping[resourceTypeUrl];

  return (
    <div
      className={cn(
        mainPadding,
        "px-20 bg-background flex flex-col gap-4 border-b",
      )}
    >
      <EntityHeader
        title={`${name} Table`}
        description={`Every ${name} record in the database`}
      />
      <div>{children}</div>
    </div>
  );
};

export default Layout;
