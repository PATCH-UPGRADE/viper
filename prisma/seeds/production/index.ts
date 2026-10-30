import { seedCsafIntegration } from "./csaf-integration";
import { seedDeviceGuides } from "./device-guides";
import { seedDeviceTypes, seedFleetProducts } from "./device-types";
import { seedManufacturers } from "./manufacturers";

export async function seedProductionData() {
  await seedManufacturers();
  const deviceTypeIds = await seedDeviceTypes();
  await seedFleetProducts(deviceTypeIds);
  await seedDeviceGuides(deviceTypeIds);
  await seedCsafIntegration();
}
