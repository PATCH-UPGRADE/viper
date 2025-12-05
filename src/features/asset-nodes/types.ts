/*export type WorkflowContext = Record<string, unknown>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
  data: TData;
  nodeId: string;
  context: WorkflowContext;
}

export type NodeExecutor<TData = Record<string, unknown>> = (
  params: NodeExecutorParams<TData>,
) => Promise<WorkflowContext>;*/

import { ComputerIcon, MonitorIcon, SyringeIcon } from "lucide-react";

export enum DeviceIconType {
  WOW = "Workstaion on Wheels",
  InfusionPump = "Infusion Pump",
  PatientMonitor = "Patient Monitor",
}

export function getIconByType(iconType: DeviceIconType) {
  const iconMap = {
    [DeviceIconType.WOW]: ComputerIcon,
    [DeviceIconType.InfusionPump]: SyringeIcon,
    [DeviceIconType.PatientMonitor]: MonitorIcon,
  };

  return iconMap[iconType];
}
