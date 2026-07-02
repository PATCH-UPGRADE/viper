import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  DepartmentsContainer,
  DepartmentsError,
  DepartmentsList,
  DepartmentsLoading,
} from "@/features/departments/components/departments";
import { prefetchDepartments } from "@/features/departments/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  await prefetchDepartments();

  return (
    <DepartmentsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<DepartmentsError />}>
          <Suspense fallback={<DepartmentsLoading />}>
            <DepartmentsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </DepartmentsContainer>
  );
};

export default Page;
