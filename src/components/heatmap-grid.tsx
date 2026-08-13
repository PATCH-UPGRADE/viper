"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type HeatmapAxis = {
  count: number;
  label: (index: number) => string;
  name: (index: number) => string;
};

export type HeatmapCell = {
  x: number;
  y: number;
  value: number;
  xName: string;
  yName: string;
};

type HeatmapGridProps = {
  x: HeatmapAxis;
  y: HeatmapAxis;
  getValue: (x: number, y: number) => number;
  // each cell css classes
  getCellClass: (value: number) => string;
  getTooltip: (cell: HeatmapCell) => string;
  // optional for accessibility, default to tooltip
  getAriaLabel?: (cell: HeatmapCell) => string;
  // optional styles for grid
  cellClassName?: string;
  // classes specific for the header
  rowHeaderClassName?: string;
};

export function HeatMapGrid({
  x,
  y,
  getValue,
  getCellClass,
  getTooltip,
  getAriaLabel,
  cellClassName = "w-full h-3.5",
  rowHeaderClassName = "w-8 min-w-8",
}: HeatmapGridProps) {
  const headerGroups: { label: string; span: number }[] = [];
  for (let i = 0; i < x.count; i++) {
    const label = x.label(i);
    const current = headerGroups.at(-1);
    if (label === null && current) {
      current.span++;
    } else {
      headerGroups.push({ label: label ?? "", span: 1 });
    }
  }
  const describe = getAriaLabel ?? getTooltip;

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full min-w-[320px] table-fixed border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th
              className={`sticky left-0 bg-background ${rowHeaderClassName}`}
            />
            {headerGroups.map(({ label, span }, idx) => (
              <th
                key={idx + label}
                colSpan={span}
                className="text-muted-foreground font-medium text-left pb-1"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: y.count }, (_, yIdx) => (
            <tr key={yIdx}>
              <td className="sticky left-0 bg-background text-muted-foreground text-right pr-1.5 leading-none py-0.5">
                {y.label(yIdx)}
              </td>
              {Array.from({ length: x.count }, (v, xIdx) => {
                const cell: HeatmapCell = {
                  x: xIdx,
                  y: yIdx,
                  value: getValue(xIdx, yIdx),
                  xName: x.name(xIdx),
                  yName: y.name(yIdx),
                };
                return (
                  <td key={xIdx} className="p-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={describe(cell)}
                          className={`rounded-sm cursor-default ${cellClassName} ${getCellClass(cell.value)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{getTooltip(cell)}</TooltipContent>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
