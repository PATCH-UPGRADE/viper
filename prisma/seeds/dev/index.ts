import { seedAssets } from "./assets";
import { seedCategoryColors } from "./category-colors";
import { seedDepartments } from "./departments";
import { seedDeviceArtifacts } from "./device-artifacts";
import { seedDeviceGroups } from "./device-groups";
import {
  isFleetAdvisoryNotificationSeeded,
  seedFleetAdvisoryNotification,
  seedFleetIntegration,
} from "./fleet-integration";
import { seedNotes } from "./notes";
import { seedRemediations } from "./remediations";
import { createOrGetSeedUser } from "./seed-user";
import { seedVendors } from "./vendors";
import { seedVulnerabilities } from "./vulnerabilities";
import { seedWorkOrderTickets } from "./work-orders";
import { seedWorkflows } from "./workflows";

export { SEED_USER } from "./seed-user";

export async function isDemoDataLoaded() {
  return isFleetAdvisoryNotificationSeeded();
}

export async function seedDemoData() {
  const seedUser = await createOrGetSeedUser();

  await seedDepartments(seedUser.id);
  await seedCategoryColors();
  await seedDeviceGroups();
  await seedAssets(seedUser.id);
  await seedVendors();
  await seedFleetIntegration(seedUser.id);
  await seedVulnerabilities(seedUser.id);
  await seedDeviceArtifacts(seedUser.id);
  await seedRemediations(seedUser.id);
  await seedWorkflows(seedUser.id);
  await seedNotes(seedUser.id);
  await seedWorkOrderTickets(seedUser.id);
  // After the vulnerabilities, whose CPEs create the matchings it links to.
  await seedFleetAdvisoryNotification();
}
