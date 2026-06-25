-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('UNKNOWN', 'NOT_APPLICABLE', 'KNOWN');

-- CreateEnum
CREATE TYPE "VersScheme" AS ENUM ('GENERIC', 'SEMVER', 'NPM', 'PYPI', 'MAVEN', 'RPM', 'DEB', 'GEM', 'NUGET', 'GOLANG', 'ALPINE', 'CARGO', 'COMPOSER', 'CONAN');

-- DropForeignKey
ALTER TABLE "_AdvisoryDeviceGroups" DROP CONSTRAINT "_AdvisoryDeviceGroups_A_fkey";

-- DropForeignKey
ALTER TABLE "_AdvisoryDeviceGroups" DROP CONSTRAINT "_AdvisoryDeviceGroups_B_fkey";

-- DropForeignKey
ALTER TABLE "_RemediationDeviceGroups" DROP CONSTRAINT "_RemediationDeviceGroups_A_fkey";

-- DropForeignKey
ALTER TABLE "_RemediationDeviceGroups" DROP CONSTRAINT "_RemediationDeviceGroups_B_fkey";

-- DropForeignKey
ALTER TABLE "_VulnerabilityDeviceGroups" DROP CONSTRAINT "_VulnerabilityDeviceGroups_A_fkey";

-- DropForeignKey
ALTER TABLE "_VulnerabilityDeviceGroups" DROP CONSTRAINT "_VulnerabilityDeviceGroups_B_fkey";

-- DropForeignKey
ALTER TABLE "device_artifact" DROP CONSTRAINT "device_artifact_deviceGroupId_fkey";

-- DropIndex
DROP INDEX "device_artifact_deviceGroupId_idx";

-- DropIndex
DROP INDEX "device_group_cpe_idx";

-- DropIndex
DROP INDEX "device_group_cpe_key";

-- AlterTable
ALTER TABLE "device_artifact" DROP COLUMN "deviceGroupId";

-- AlterTable
ALTER TABLE "device_group" DROP COLUMN "manufacturer",
DROP COLUMN "modelName",
DROP COLUMN "version",
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "udi" TEXT,
ADD COLUMN     "vendorId" TEXT,
ADD COLUMN     "versionId" TEXT,
ADD COLUMN     "versionStatus" "VersionStatus" NOT NULL DEFAULT 'UNKNOWN',
DROP COLUMN "cpe",
ADD COLUMN     "cpe" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "_AdvisoryDeviceGroups";

-- DropTable
DROP TABLE "_RemediationDeviceGroups";

-- DropTable
DROP TABLE "_VulnerabilityDeviceGroups";

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalDisplayName" TEXT NOT NULL,
    "hasCpe" BOOLEAN NOT NULL DEFAULT false,
    "nameMappings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalDisplayName" TEXT NOT NULL,
    "hasCpe" BOOLEAN NOT NULL DEFAULT false,
    "nameMappings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalDisplayName" TEXT NOT NULL,
    "hasCpe" BOOLEAN NOT NULL DEFAULT false,
    "versScheme" "VersScheme",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_group_matching" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT,
    "versionId" TEXT,
    "versionRange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_group_matching_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_VulnerabilityMatchings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_VulnerabilityMatchings_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RemediationMatchings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RemediationMatchings_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DeviceArtifactMatchings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DeviceArtifactMatchings_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AdvisoryMatchings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdvisoryMatchings_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_canonicalName_key" ON "vendor"("canonicalName");

-- CreateIndex
CREATE INDEX "vendor_canonicalName_idx" ON "vendor"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "product_canonicalName_key" ON "product"("canonicalName");

-- CreateIndex
CREATE INDEX "product_canonicalName_idx" ON "product"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "version_canonicalName_key" ON "version"("canonicalName");

-- CreateIndex
CREATE INDEX "device_group_matching_vendorId_productId_idx" ON "device_group_matching"("vendorId", "productId");

-- CreateIndex
CREATE INDEX "_VulnerabilityMatchings_B_index" ON "_VulnerabilityMatchings"("B");

-- CreateIndex
CREATE INDEX "_RemediationMatchings_B_index" ON "_RemediationMatchings"("B");

-- CreateIndex
CREATE INDEX "_DeviceArtifactMatchings_B_index" ON "_DeviceArtifactMatchings"("B");

-- CreateIndex
CREATE INDEX "_AdvisoryMatchings_B_index" ON "_AdvisoryMatchings"("B");

-- CreateIndex
CREATE INDEX "device_group_vendorId_productId_idx" ON "device_group"("vendorId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "device_group_vendorId_productId_versionId_versionStatus_key" ON "device_group"("vendorId", "productId", "versionId", "versionStatus");

-- AddForeignKey
ALTER TABLE "device_group" ADD CONSTRAINT "device_group_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group" ADD CONSTRAINT "device_group_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group" ADD CONSTRAINT "device_group_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_matching" ADD CONSTRAINT "device_group_matching_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_matching" ADD CONSTRAINT "device_group_matching_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_matching" ADD CONSTRAINT "device_group_matching_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VulnerabilityMatchings" ADD CONSTRAINT "_VulnerabilityMatchings_A_fkey" FOREIGN KEY ("A") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VulnerabilityMatchings" ADD CONSTRAINT "_VulnerabilityMatchings_B_fkey" FOREIGN KEY ("B") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RemediationMatchings" ADD CONSTRAINT "_RemediationMatchings_A_fkey" FOREIGN KEY ("A") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RemediationMatchings" ADD CONSTRAINT "_RemediationMatchings_B_fkey" FOREIGN KEY ("B") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceArtifactMatchings" ADD CONSTRAINT "_DeviceArtifactMatchings_A_fkey" FOREIGN KEY ("A") REFERENCES "device_artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceArtifactMatchings" ADD CONSTRAINT "_DeviceArtifactMatchings_B_fkey" FOREIGN KEY ("B") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryMatchings" ADD CONSTRAINT "_AdvisoryMatchings_A_fkey" FOREIGN KEY ("A") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryMatchings" ADD CONSTRAINT "_AdvisoryMatchings_B_fkey" FOREIGN KEY ("B") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

