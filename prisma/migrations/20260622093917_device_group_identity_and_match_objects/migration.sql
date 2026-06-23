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

-- DropIndex
DROP INDEX "device_group_cpe_idx";

-- DropIndex
DROP INDEX "device_group_cpe_key";

-- AlterTable
ALTER TABLE "device_group" DROP COLUMN "cpe",
DROP COLUMN "manufacturer",
DROP COLUMN "modelName",
ADD COLUMN     "gudid" TEXT,
ADD COLUMN     "product" TEXT NOT NULL,
ADD COLUMN     "vendor" TEXT NOT NULL;

-- DropTable
DROP TABLE "_AdvisoryDeviceGroups";

-- DropTable
DROP TABLE "_RemediationDeviceGroups";

-- DropTable
DROP TABLE "_VulnerabilityDeviceGroups";

-- CreateTable
CREATE TABLE "device_group_cpe" (
    "id" TEXT NOT NULL,
    "cpe" TEXT NOT NULL,
    "deviceGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_group_cpe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dg_match_object" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "product" TEXT,
    "version" TEXT,
    "versionRange" TEXT,
    "vulnerabilityId" TEXT,
    "remediationId" TEXT,
    "advisoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dg_match_object_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_group_cpe_cpe_idx" ON "device_group_cpe"("cpe");

-- CreateIndex
CREATE UNIQUE INDEX "device_group_cpe_deviceGroupId_cpe_key" ON "device_group_cpe"("deviceGroupId", "cpe");

-- CreateIndex
CREATE INDEX "dg_match_object_vendor_product_idx" ON "dg_match_object"("vendor", "product");

-- CreateIndex
CREATE INDEX "dg_match_object_vulnerabilityId_idx" ON "dg_match_object"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "dg_match_object_remediationId_idx" ON "dg_match_object"("remediationId");

-- CreateIndex
CREATE INDEX "dg_match_object_advisoryId_idx" ON "dg_match_object"("advisoryId");

-- CreateIndex
CREATE INDEX "device_group_vendor_product_idx" ON "device_group"("vendor", "product");

-- CreateIndex
CREATE UNIQUE INDEX "device_group_vendor_product_version_key" ON "device_group"("vendor", "product", "version");

-- AddForeignKey
ALTER TABLE "device_group_cpe" ADD CONSTRAINT "device_group_cpe_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dg_match_object" ADD CONSTRAINT "dg_match_object_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dg_match_object" ADD CONSTRAINT "dg_match_object_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dg_match_object" ADD CONSTRAINT "dg_match_object_advisoryId_fkey" FOREIGN KEY ("advisoryId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

