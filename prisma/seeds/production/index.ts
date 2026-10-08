import { seedManufacturers } from "./manufacturers";

export async function seedProductionData() {
  await seedManufacturers();
}
