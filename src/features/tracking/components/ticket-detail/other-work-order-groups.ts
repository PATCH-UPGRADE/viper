import type { OtherAssetWorkOrder } from "../../types";
import { assetLabel, type DetailAssetTicket, locationLabel } from "./shared";

export const NO_TEAM_LABEL = "No team";

export type WorkOrderGroup = {
  key: string;
  label: string;
  subLabel?: string;
  assetId?: string;
  workOrders: OtherAssetWorkOrder[];
};

export const assetLabelsById = (
  assetTickets: DetailAssetTicket[],
): Record<string, string> =>
  Object.fromEntries(
    assetTickets.map(({ asset }) => [asset.id, assetLabel(asset)]),
  );

// One group per linked asset that has overlapping work, in the order given.
// A ticket can link dozens of assets, so an asset with nothing overlapping is
// left out rather than rendered as an empty group.
export const groupByAsset = (
  assetTickets: DetailAssetTicket[],
  workOrders: OtherAssetWorkOrder[],
): WorkOrderGroup[] =>
  assetTickets
    .map(({ asset }) => ({
      key: asset.id,
      label: assetLabel(asset),
      subLabel: locationLabel(asset.location) ?? undefined,
      assetId: asset.id,
      workOrders: workOrders.filter((wo) =>
        wo.assetTickets.some((link) => link.assetId === asset.id),
      ),
    }))
    .filter((group) => group.workOrders.length > 0);

// One group per department, alphabetical, with a trailing "No team" group. A
// work order in two departments appears under both, so the group counts sum to
// more than the distinct total the card header shows.
export const groupByTeam = (
  workOrders: OtherAssetWorkOrder[],
): WorkOrderGroup[] => {
  const byDepartment = new Map<string, WorkOrderGroup>();
  const noTeam: OtherAssetWorkOrder[] = [];

  for (const workOrder of workOrders) {
    if (workOrder.departments.length === 0) {
      noTeam.push(workOrder);
      continue;
    }
    for (const department of workOrder.departments) {
      const group = byDepartment.get(department.id);
      if (group) group.workOrders.push(workOrder);
      else
        byDepartment.set(department.id, {
          key: department.id,
          label: department.name,
          workOrders: [workOrder],
        });
    }
  }

  const groups = [...byDepartment.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  if (noTeam.length > 0) {
    // A department id is a cuid, so the label cannot collide with one as a key.
    groups.push({
      key: NO_TEAM_LABEL,
      label: NO_TEAM_LABEL,
      workOrders: noTeam,
    });
  }
  return groups;
};

/** Per-asset count for the Linked Assets column. Assets with none are absent. */
export const countOtherWorkOrdersByAsset = (
  workOrders: OtherAssetWorkOrder[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const workOrder of workOrders) {
    for (const { assetId } of workOrder.assetTickets) {
      counts[assetId] = (counts[assetId] ?? 0) + 1;
    }
  }
  return counts;
};
