import { seedCsafIntegration } from "./csaf-integration";
import { seedManufacturers } from "./manufacturers";

export async function seedProductionData() {
  await seedManufacturers();
  await seedCsafIntegration();
}
