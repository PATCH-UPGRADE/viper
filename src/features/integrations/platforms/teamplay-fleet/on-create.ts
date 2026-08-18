import { resolveManufacturer, resolveVendor } from "@/lib/router-utils";
import { SIEMENS_HEALTHINEERS } from "./config";

export async function onCreate(): Promise<void> {
  const manufacturer = await resolveManufacturer(SIEMENS_HEALTHINEERS);
  await resolveVendor(SIEMENS_HEALTHINEERS, {
    manufacturerId: manufacturer.id,
  });
}
