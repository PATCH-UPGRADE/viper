import { ComputerIcon, MonitorIcon, SyringeIcon } from "lucide-react";

export enum DeviceIconType {
  WOW = "Workstation on Wheels",
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
