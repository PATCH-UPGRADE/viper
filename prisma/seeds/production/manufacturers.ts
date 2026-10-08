import { CURATED_MANUFACTURERS } from "@/lib/manufacturer-catalog";
import {
  logManufacturerUpsertPlan,
  upsertManufacturers,
} from "@/lib/manufacturer-upsert";

export async function seedManufacturers() {
  console.log("\n🌱 Seeding curated manufacturers...");
  const plan = await upsertManufacturers(CURATED_MANUFACTURERS);
  logManufacturerUpsertPlan(plan);
}
