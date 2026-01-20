import prisma from "@/lib/db";

export async function cpeToDeviceGroup(cpe: string) {
  // requires: cpe is properly formatted according to cpeSchema
  // outputs: the DeviceGroup model instance that `cpe` specifies (creates a new one if none exist)
  try {
    console.log("HERE");
    return await prisma.deviceGroup.findUniqueOrThrow({
      where: { cpe },
    });
  } catch (error) {
    console.log("HEY", error);
    // If not found, create a new device group
    // TODO: VW-38 create a cpe naming table here to standardize input
    // also populate Manufacturer, model name, version fields
    return prisma.deviceGroup.create({
      data: {
        cpe,
      },
    });
  }
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}
