import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
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
        <ReportingErrorBoundary fallback={<DepartmentsError />}>
          <Suspense fallback={<DepartmentsLoading />}>
            <DepartmentsList />
          </Suspense>
        </ReportingErrorBoundary>
      </HydrateClient>
    </DepartmentsContainer>
  );
};

export default Page;
