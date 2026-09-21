import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PriorityBadge } from "@/components/priority-badge";
import type { Priority } from "@/generated/prisma";

export const FieldChange = ({
  label,
  from,
  to,
  note,
}: {
  label: string;
  from?: ReactNode;
  to: ReactNode;
  note?: string | null;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-foreground">{label}</span>
      {from != null && (
        <>
          {from}
          <ArrowRightIcon className="size-4 text-muted-foreground" />
        </>
      )}
      {to}
    </div>
    {note && (
      <p className="whitespace-pre-wrap border-l-2 pl-2.5 text-xs italic text-muted-foreground">
        {note}
      </p>
    )}
  </div>
);

export type FieldRenderer = {
  label: string;
  render: (value: string) => ReactNode;
};

export type FieldRenderers = Record<string, FieldRenderer>;

export const priorityFieldRenderer: FieldRenderer = {
  label: "Priority",
  render: (value) => <PriorityBadge priority={value as Priority} />,
};

const plainValue = (value: string) => (
  <span className="font-medium text-foreground">{value}</span>
);

export const FieldValueChange = ({
  field,
  from,
  to,
  note,
  renderers,
}: {
  field: string;
  from?: string | null;
  to: string;
  note?: string | null;
  renderers: FieldRenderers;
}) => {
  const renderer = renderers[field] ?? { label: field, render: plainValue };
  return (
    <FieldChange
      label={renderer.label}
      from={from ? renderer.render(from) : undefined}
      to={renderer.render(to)}
      note={note}
    />
  );
};
