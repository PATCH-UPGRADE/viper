import type { ArtifactType } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  matchingForGroup,
  upsertManufacturer,
  upsertProduct,
  upsertVersion,
} from "./canonical-identity";

// Add device artifacts here as needed in the future
const SAMPLE_DEVICE_ARTIFACTS: {
  role: string;
  cpe: string;
  dockerUrl?: string;
  downloadUrl?: string;
  description: string;
}[] = [];

export async function seedDeviceArtifacts(userId: string) {
  console.log("\n🌱 Seeding device artifacts...");

  const deviceArtifacts = await Promise.all(
    SAMPLE_DEVICE_ARTIFACTS.map(async (deviceArtifact) => {
      // Resolve the artifact's identity (the device it's for) from its CPE.
      const parts = deviceArtifact.cpe.split(":");
      const norm = (v?: string) => (!v || v === "-" || v === "*" ? null : v);
      const manufacturer = await upsertManufacturer(norm(parts[3]) ?? "-");
      const product = await upsertProduct(norm(parts[4]) ?? "-");
      const versionName = norm(parts[5]);
      const version = versionName ? await upsertVersion(versionName) : null;
      const identityMatchingId = await matchingForGroup({
        manufacturerId: manufacturer.id,
        productId: product.id,
        versionId: version?.id ?? null,
      });

      const createdDeviceArtifact = await prisma.deviceArtifact.create({
        data: {
          role: deviceArtifact.role,
          description: deviceArtifact.description,
          deviceGroupMatchings: identityMatchingId
            ? { connect: { id: identityMatchingId } }
            : undefined,
          userId,
        },
      });

      const wrapper = await prisma.artifactWrapper.create({
        data: {
          deviceArtifactId: createdDeviceArtifact.id,
          userId,
        },
      });

      const artifacts = [];

      if (deviceArtifact.dockerUrl) {
        const dockerArtifact = await prisma.artifact.create({
          data: {
            wrapperId: wrapper.id,
            name: "Docker Image",
            artifactType: "Emulator" as ArtifactType,
            downloadUrl: deviceArtifact.dockerUrl,
            versionNumber: 1,
            userId,
          },
        });
        artifacts.push(dockerArtifact);
      }

      if (deviceArtifact.downloadUrl) {
        const downloadArtifact = await prisma.artifact.create({
          data: {
            wrapperId: wrapper.id,
            name: "Download",
            artifactType: "Emulator" as ArtifactType,
            downloadUrl: deviceArtifact.downloadUrl,
            versionNumber: 1,
            userId,
          },
        });
        artifacts.push(downloadArtifact);
      }

      if (artifacts.length > 0) {
        await prisma.artifactWrapper.update({
          where: { id: wrapper.id },
          data: {
            latestArtifactId: artifacts[artifacts.length - 1].id,
          },
        });
      }

      return createdDeviceArtifact;
    }),
  );

  const successfulDeviceArtifacts = deviceArtifacts.filter((da) => da !== null);
  console.log(`✅ Seeded ${successfulDeviceArtifacts.length} device artifacts`);
  return successfulDeviceArtifacts;
}
