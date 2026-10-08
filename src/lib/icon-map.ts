import {
  ActivityIcon,
  MonitorIcon,
  SyringeIcon,
  ThermometerIcon,
} from "lucide-react";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string }>;

// Icon name -> component. Values are plain components, not lucide types, so
// icons from another library can be added here later.
const icons: Record<string, IconComponent> = {
  Monitor: MonitorIcon,
  Syringe: SyringeIcon,
  Activity: ActivityIcon,
  Thermometer: ThermometerIcon,
};

export const iconFor = (name?: string | null): IconComponent =>
  name && Object.hasOwn(icons, name) ? icons[name] : MonitorIcon;
