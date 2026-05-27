import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { prefetchDepartments } from "@/features/departments/server/prefetch";
import {
  TagColorsContainer,
  TagColorsError,
  TagColorsList,
  TagColorsLoading,
} from "@/features/tag-colors/components/tag-colors";
import { prefetchCategoryColors } from "@/features/tag-colors/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  prefetchDepartments();
  prefetchCategoryColors();

  return (
    <TagColorsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<TagColorsError />}>
          <Suspense fallback={<TagColorsLoading />}>
            <TagColorsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </TagColorsContainer>
  );
};

export default Page;
