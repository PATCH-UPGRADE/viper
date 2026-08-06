"use client";

import { CommandMultiSelect } from "@/components/ui/command-multi-select";

type ContactOptions = { email: string; name?: string };

export function ContactMultiSelect({
  options,
  selected,
  onChange,
  ...aria
}: {
  options: ContactOptions[];
  selected: string[];
  onChange: (emails: string[]) => void;
} & React.AriaAttributes) {
  return (
    <CommandMultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      getKey={(o) => o.email}
      getSearchValue={(o) => `${o.name ?? ""} ${o.email}`}
      renderOption={(o) => (o.name ? `${o.name} - ${o.email}` : o.email)}
      getChipLabel={(o, key) => o?.email ?? key}
      chipVariant="secondary"
      getChipClassName={() => "font-mono"}
      placeholder="Select contacts..."
      searchPlaceholder="Search contacts..."
      emptyText="No contacts found."
      containerClassName="w-full"
      triggerClassName="h-8"
      {...aria}
    />
  );
}
