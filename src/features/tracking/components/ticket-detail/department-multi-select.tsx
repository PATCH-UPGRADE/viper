"use client";

import { CommandMultiSelect } from "@/components/ui/command-multi-select";
import { getChipClass } from "@/features/tag-colors/palette";

type DepartmentOption = { id: string; name: string; color: string | null };

export const DepartmentMultiSelect = ({
  options,
  selectedIds,
  onChange,
}: {
  options: DepartmentOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  return (
    <CommandMultiSelect
      options={options}
      selected={selectedIds}
      onChange={onChange}
      getKey={(o) => o.id}
      getSearchValue={(o) => o.name}
      renderOption={(o) => o.name}
      getChipLabel={(o, key) => o?.name ?? key}
      chipVariant="outline"
      getChipClassName={(o) => getChipClass(o?.color ?? null)}
      placeholder="Select departments..."
      searchPlaceholder="Search departments..."
      emptyText="No departments found."
    />
  );
};
