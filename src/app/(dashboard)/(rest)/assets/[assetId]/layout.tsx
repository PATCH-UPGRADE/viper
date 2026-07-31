import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  AssetContainer,
  AssetError,
  AssetHeader,
  AssetLoading,
} from "@/features/assets/components/asset";
import { AssetTabs } from "@/features/assets/components/asset-tabs";
import { prefetchAsset } from "@/features/assets/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ assetId: string }>;
}

const Layout = async ({ children, params }: LayoutProps) => {
  await requireAuth();

  const { assetId } = await params;
  prefetchAsset(assetId);

  return (
    <AssetContainer>
      <HydrateClient>
        <div className="flex flex-col gap-4">
          <ErrorBoundary fallback={<AssetError />}>
            <Suspense fallback={<AssetLoading />}>
              <AssetHeader assetId={assetId} />
            </Suspense>
          </ErrorBoundary>
          <AssetTabs assetId={assetId} />
          {children}
        </div>
      </HydrateClient>
    </AssetContainer>
  );
};

export default Layout;
