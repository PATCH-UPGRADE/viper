import { seedCsafIntegration } from "./csaf-integration";
import { seedDeviceTypes, seedFleetProducts } from "./device-types";
import { seedManufacturers } from "./manufacturers";

export async function seedProductionData() {
  await seedManufacturers();
  const deviceTypeIds = await seedDeviceTypes();
  await seedFleetProducts(deviceTypeIds);
  await seedCsafIntegration();
}
