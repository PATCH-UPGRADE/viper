import { ActivityIcon, MonitorIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { iconFor } from "./icon-map";

describe("iconFor", () => {
  it("returns the icon for a known name", () => {
    expect(iconFor("Activity")).toBe(ActivityIcon);
  });

  it("falls back to the monitor icon for an unknown name or none", () => {
    expect(iconFor("Nope")).toBe(MonitorIcon);
    expect(iconFor("constructor")).toBe(MonitorIcon);
    expect(iconFor(null)).toBe(MonitorIcon);
    expect(iconFor()).toBe(MonitorIcon);
  });
});
