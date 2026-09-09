import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

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
