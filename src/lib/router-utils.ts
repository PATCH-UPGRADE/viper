import "server-only";
import prisma from "@/lib/db";

export async function cpeToDeviceGroup(cpe: string) {
  // requires: cpe is properly formatted according to cpeSchema
  // outputs: the DeviceGroup model instance that `cpe` specifies (creates a new one if none exist)

  // TODO: VW-38 create a cpe naming table here to standardize input
  // when creating a new device group, also populate Manufacturer, model name, version fields
  return prisma.deviceGroup.upsert({
    where: { cpe },
    update: {},
    create: { cpe },
  });
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}
