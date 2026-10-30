"use client";

import { Badge } from "@/components/ui/badge";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { type PageProduct, toProductGuides } from "../device-guides";
import { useDeviceGuides } from "../hooks/use-device-guides";

export function DeviceGuideList({ products }: { products: PageProduct[] }) {
  const { data, isPending, isError } = useDeviceGuides({
    deviceTypeIds: [
      ...new Set(
        products.flatMap((p) => (p.deviceTypeId ? [p.deviceTypeId] : [])),
      ),
    ],
    productIds: products.map((p) => p.productId),
  });

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load device information
      </p>
    );
  }
  return (
    <div className="divide-y">
      {toProductGuides(products, data).map((guide) => {
        return (
          <section
            key={guide.productId}
            className="space-y-2 py-4 pt-5 first:pt-0"
          >
            <h4 className="text-sm font-semibold">
              {guide.deviceType
                ? `${guide.product} \u2022 ${guide.deviceType}`
                : guide.product}
            </h4>
            {guide.generalText || guide.productText ? (
              <>
                <p className="flex items-center gap-2 text-xs font-medium text-primary">
                  In most hospitals
                  <Badge variant="outline" className="uppercase tracking-wide">
                    General information
                  </Badge>
                </p>

                <div className="text-sm space-y-2">
                  {guide.generalText && (
                    <MarkdownWithTablesWrapper plainLinks>
                      {guide.generalText}
                    </MarkdownWithTablesWrapper>
                  )}
                  {guide.productText && (
                    <MarkdownWithTablesWrapper plainLinks>
                      {guide.productText ?? ""}
                    </MarkdownWithTablesWrapper>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reference information yet for this device type
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
