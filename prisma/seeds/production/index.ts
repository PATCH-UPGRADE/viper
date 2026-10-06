import { seedDeviceTypes, seedFleetProducts } from "../../device-type-seeding";
import { seedCsafIntegration } from "./csaf-integration";
import { seedManufacturers } from "./manufacturers";

export async function seedProductionData() {
  await seedManufacturers();
  const deviceTypeIds = await seedDeviceTypes();
  await seedFleetProducts(deviceTypeIds);
  await seedCsafIntegration();
}
