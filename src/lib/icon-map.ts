import {
  ActivityIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  MonitorIcon,
  NetworkIcon,
  ScanLineIcon,
  ShieldIcon,
  SyringeIcon,
  ThermometerIcon,
  WindIcon,
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
  Wind: WindIcon,
  FlaskConical: FlaskConicalIcon,
  ScanLine: ScanLineIcon,
  Database: DatabaseIcon,
  Shield: ShieldIcon,
  Network: NetworkIcon,
};

export const iconFor = (name?: string | null): IconComponent =>
  name && Object.hasOwn(icons, name) ? icons[name] : MonitorIcon;
