"use client";

import {
  EntityContainer,
  EntityHeader,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import { useSuspenseVendors } from "../hooks/use-vendors";
import { columns } from "./columns";

export const VendorsList = () => {
  const { data, isFetching } = useSuspenseVendors();

  return (
    <DataTable paginatedData={data} columns={columns} isLoading={isFetching} />
  );
};

export const VendorsHeader = () => {
  return (
    <EntityHeader
      title="Vendors"
      description="Companies the hospital contracts with to service its equipment"
    />
  );
};

export const VendorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<VendorsHeader />}>{children}</EntityContainer>
  );
};

export const VendorsLoading = () => {
  return <LoadingView message="Loading vendors..." />;
};

export const VendorsError = () => {
  return <ErrorView message="Error loading vendors" />;
};
