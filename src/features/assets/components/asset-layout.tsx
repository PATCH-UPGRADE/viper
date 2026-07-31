"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetHeader } from "./asset";

interface Tab {
  name: string;
  value: string;
  href: string;
}

export const AssetLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  // pathname looks like "/assets/rad-ct-002" or "/assets/rad-ct-002/work-orders".
  // Splitting on "/" gives ["", "assets", "rad-ct-002", "work-orders"?], so the
  // asset id is always at index 2.
  const assetId = pathname.split("/").at(2) ?? "";

  const tabs: Tab[] = [
    { name: "Overview", value: "overview", href: `/assets/${assetId}` },
    {
      name: "Work Orders",
      value: "work-orders",
      href: `/assets/${assetId}/work-orders`,
    },
  ];

  const activeTab = pathname.endsWith("/work-orders")
    ? "work-orders"
    : "overview";

  return (
    <div className="flex flex-col gap-4">
      <ErrorBoundary fallback={null}>
        <Suspense fallback={<div className="h-24" />}>
          <AssetHeader assetId={assetId} />
        </Suspense>
      </ErrorBoundary>

      <div className="px-4">
        <Tabs value={activeTab}>
          <TabsList variant="line-primary">
            {tabs.map((tab) => (
              <TabsTrigger value={tab.value} key={tab.value} asChild>
                <Link href={tab.href}>{tab.name}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {children}
    </div>
  );
};
