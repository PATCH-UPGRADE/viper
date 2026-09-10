"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const AssetTabs = ({ assetId }: { assetId: string }) => {
  const pathname = usePathname();
  const activeTab = pathname.endsWith("/work-orders")
    ? "work-orders"
    : "overview";

  return (
    <div className="px-4">
      <Tabs value={activeTab}>
        <TabsList variant="line-primary">
          <TabsTrigger value="overview" asChild>
            <Link href={`/assets/${assetId}`}>Overview</Link>
          </TabsTrigger>
          <TabsTrigger value="work-orders" asChild>
            <Link href={`/assets/${assetId}/work-orders`}>Work Orders</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};
