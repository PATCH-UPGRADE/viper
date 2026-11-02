import prisma from "@/lib/db";
import { deviceForSampleCpe } from "./device-groups";

const SAMPLE_PRODUCT_GUIDES = [
  {
    cpe: "cpe:2.3:h:baxter:sigma_spectrum:-:*:*:*:*:*:*:*",
    body: "A smart pump with a built-in drug library that limits doses. Nurses rely on the library being up to date, so updates are usually planned with pharmacy.",
  },
  {
    cpe: "cpe:2.3:h:siemens:somatom_go.top:-:*:*:*:*:*:*:*",
    body: "Often the main CT for the emergency department, so it may be needed at any hour for trauma and stroke patients.",
  },
];
export async function seedSampleDeviceGuides() {
  console.log("\n🌱 Seeding sample product guides...");
  const data = [];
  for (const { cpe, body } of SAMPLE_PRODUCT_GUIDES) {
    const device = await deviceForSampleCpe(cpe);
    if (!device) throw new Error(`No sample device for ${cpe}`);
    data.push({
      productId: device.productId,
      topic: "TYPICAL_USAGE" as const,
      body,
    });
  }
  const { count } = await prisma.deviceGuide.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${count} sample product guide(s)`);
}
