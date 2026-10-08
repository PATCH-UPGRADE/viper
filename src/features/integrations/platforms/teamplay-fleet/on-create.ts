import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { resolveManufacturer, resolveVendor } from "@/lib/router-utils";

export async function onCreate(): Promise<void> {
  const manufacturer = await resolveManufacturer(
    SIEMENS_HEALTHINEERS.canonicalDisplayName,
  );
  await resolveVendor(SIEMENS_HEALTHINEERS.canonicalDisplayName, {
    manufacturerId: manufacturer.id,
  });
}
