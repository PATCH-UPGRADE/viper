/*
  Warnings:

  - You are about to drop the column `cpe` on the `asset` table. All the data in the column will be lost.
  - You are about to drop the column `cpe` on the `vulnerability` table. All the data in the column will be lost.
  - You are about to drop the `asset_settings` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `deviceGroupId` to the `asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deviceGroupId` to the `emulator` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('Active', 'Decomissioned', 'Maintenance');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('Basic', 'Bearer', 'Header');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('Asset', 'Vulnerability', 'Emulator', 'Remediation');

-- DropForeignKey
ALTER TABLE "public"."asset_settings" DROP CONSTRAINT "asset_settings_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."emulator" DROP CONSTRAINT "emulator_assetId_fkey";

-- DropIndex
DROP INDEX "public"."emulator_assetId_idx";

-- DropIndex
DROP INDEX "public"."vulnerability_cpe_idx";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "cpe",
ADD COLUMN     "deviceGroupId" TEXT NOT NULL,
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "lastSynced" TIMESTAMP(3),
ADD COLUMN     "location" JSONB,
ADD COLUMN     "macAddress" TEXT,
ADD COLUMN     "networkSegment" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "status" "AssetStatus",
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "emulator" ADD COLUMN     "deviceGroupId" TEXT NOT NULL,
ADD COLUMN     "helmSbomId" TEXT,
ALTER COLUMN "assetId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vulnerability" DROP COLUMN "cpe",
ADD COLUMN     "emulatorId" TEXT;

-- DropTable
DROP TABLE "public"."asset_settings";

-- CreateTable
CREATE TABLE "device_group" (
    "id" TEXT NOT NULL,
    "cpe" TEXT NOT NULL,
    "manufacturer" TEXT,
    "modelName" TEXT,
    "version" TEXT,
    "helmSbomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_group_history" (
    "id" TEXT NOT NULL,
    "deviceGroupId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_group_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "integration-uri" TEXT NOT NULL,
    "isGeneric" BOOLEAN NOT NULL,
    "authType" "AuthType" NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "authentication" JSONB NOT NULL,
    "syncEvery" INTEGER,
    "syncSchedule" TEXT,
    "lastSyncStatusId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "error" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_VulnerabilityDeviceGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_VulnerabilityDeviceGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "device_group_cpe_idx" ON "device_group"("cpe");

-- CreateIndex
CREATE INDEX "integration_userId_idx" ON "integration"("userId");

-- CreateIndex
CREATE INDEX "_VulnerabilityDeviceGroups_B_index" ON "_VulnerabilityDeviceGroups"("B");

-- CreateIndex
CREATE INDEX "asset_deviceGroupId_idx" ON "asset"("deviceGroupId");

-- CreateIndex
CREATE INDEX "emulator_deviceGroupId_idx" ON "emulator"("deviceGroupId");

-- AddForeignKey
ALTER TABLE "device_group_history" ADD CONSTRAINT "device_group_history_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_history" ADD CONSTRAINT "device_group_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emulator" ADD CONSTRAINT "emulator_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emulator" ADD CONSTRAINT "emulator_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability" ADD CONSTRAINT "vulnerability_emulatorId_fkey" FOREIGN KEY ("emulatorId") REFERENCES "emulator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration" ADD CONSTRAINT "integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncStatus" ADD CONSTRAINT "SyncStatus_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VulnerabilityDeviceGroups" ADD CONSTRAINT "_VulnerabilityDeviceGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VulnerabilityDeviceGroups" ADD CONSTRAINT "_VulnerabilityDeviceGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
