"use client";

import { CommandMultiSelect } from "@/components/ui/command-multi-select";
import { useDeviceTypes } from "../hooks/use-device-types";

/** Picks device types by id. Loads the types when it mounts, so mount it on demand. */
export const DeviceTypeMultiSelect = ({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  const deviceTypes = useDeviceTypes();
  return (
    <CommandMultiSelect
      options={deviceTypes.data?.items ?? []}
      selected={selectedIds}
      onChange={onChange}
      getKey={(type) => type.id}
      getSearchValue={(type) => type.displayName}
      renderOption={(type) => `${type.displayName} (${type.assetCount})`}
      getChipLabel={(type, key) => type?.displayName ?? key}
      placeholder="Select device types..."
      searchPlaceholder="Search device types..."
      emptyText={
        deviceTypes.isPending
          ? "Loading device types..."
          : "No device types found."
      }
    />
  );
};
