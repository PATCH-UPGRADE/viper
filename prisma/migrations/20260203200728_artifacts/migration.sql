/*
  Warnings:

  - You are about to drop the column `deviceGroupId` on the `remediation` table. All the data in the column will be lost.
  - You are about to drop the column `fix-uri` on the `remediation` table. All the data in the column will be lost.
  - The `emulator` table will be renamed to `device_artifact`.
  - Emulator data (docker-url, download-url) will be migrated to new Artifact records.
  - Remediation deviceGroupId will be migrated to affectedDeviceGroups relation.
  - Remediation fix-uri will be migrated to new Artifact records.

*/
-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('Source', 'Binary', 'Firmware', 'Emulator', 'Documentation', 'Other');

-- DropForeignKey (we'll recreate these after renaming)
ALTER TABLE "public"."emulator" DROP CONSTRAINT "emulator_deviceGroupId_fkey";
ALTER TABLE "public"."vulnerability" DROP CONSTRAINT "vulnerability_emulatorId_fkey";
ALTER TABLE "public"."remediation" DROP CONSTRAINT "remediation_deviceGroupId_fkey";

-- DropIndex
DROP INDEX "public"."remediation_deviceGroupId_idx";

-- Rename emulator table to device_artifact
ALTER TABLE "public"."emulator" RENAME TO "device_artifact";
ALTER TABLE "device_artifact" RENAME CONSTRAINT "emulator_pkey" TO "device_artifact_pkey";
ALTER TABLE "device_artifact" RENAME CONSTRAINT "emulator_userId_fkey" TO "device_artifact_userId_fkey";
ALTER INDEX "emulator_userId_idx" RENAME TO "device_artifact_userId_idx";
ALTER INDEX "emulator_deviceGroupId_idx" RENAME TO "device_artifact_deviceGroupId_idx";

-- Rename emulatorId column to deviceArtifactId in vulnerability
ALTER TABLE "vulnerability" RENAME COLUMN "emulatorId" TO "deviceArtifactId";

-- Role and description are now nullable
ALTER TABLE "device_artifact" ALTER COLUMN "role" TEXT NULL;
ALTER TABLE "device_artifact" ALTER COLUMN "description" TEXT NULL;

-- add upstream-api
ALTER TABLE "device_artifact" ADD COLUMN "upstream-api" TEXT;

-- CreateTable artifact_wrapper
CREATE TABLE "artifact_wrapper" (
    "id" TEXT NOT NULL,
    "deviceArtifactId" TEXT,
    "remediationId" TEXT,
    "latestArtifactId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifact_wrapper_pkey" PRIMARY KEY ("id")
);

-- CreateTable artifact
CREATE TABLE "artifact" (
    "id" TEXT NOT NULL,
    "wrapperId" TEXT NOT NULL,
    "name" TEXT,
    "artifactType" "ArtifactType" NOT NULL,
    "download-url" TEXT,
    "size" INTEGER,
    "prevVersionId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable for many-to-many Remediation <-> DeviceGroup
CREATE TABLE "_RemediationDeviceGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RemediationDeviceGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifact_wrapper_latestArtifactId_key" ON "artifact_wrapper"("latestArtifactId");
CREATE INDEX "artifact_wrapper_remediationId_idx" ON "artifact_wrapper"("remediationId");
CREATE INDEX "artifact_wrapper_deviceArtifactId_idx" ON "artifact_wrapper"("deviceArtifactId");
CREATE INDEX "artifact_wrapper_userId_idx" ON "artifact_wrapper"("userId");
CREATE INDEX "artifact_wrapper_latestArtifactId_idx" ON "artifact_wrapper"("latestArtifactId");
CREATE UNIQUE INDEX "artifact_prevVersionId_key" ON "artifact"("prevVersionId");
CREATE INDEX "artifact_wrapperId_idx" ON "artifact"("wrapperId");
CREATE INDEX "artifact_userId_idx" ON "artifact"("userId");
CREATE INDEX "_RemediationDeviceGroups_B_index" ON "_RemediationDeviceGroups"("B");
-- TODO: CREATE INDEX "vulnerability_deviceArtifactId_idx" ON "vulnerability"("deviceArtifactId");

-- DATA MIGRATION: Migrate Emulator docker-url and download-url to Artifacts
DO $$
DECLARE
    emulator_record RECORD;
    wrapper_id TEXT;
    artifact_id TEXT;
BEGIN
    FOR emulator_record IN SELECT * FROM "device_artifact" LOOP
        -- Create ArtifactWrapper for this device_artifact
        wrapper_id := 'wrapper_' || emulator_record.id;
        INSERT INTO "artifact_wrapper" ("id", "deviceArtifactId", "userId", "createdAt", "updatedAt")
        VALUES (wrapper_id, emulator_record.id, emulator_record."userId", NOW(), NOW());

        -- If docker-url exists, create an artifact for it
        IF emulator_record."docker-url" IS NOT NULL THEN
            artifact_id := 'artifact_docker_' || emulator_record.id;
            INSERT INTO "artifact" ("id", "wrapperId", "name", "artifactType", "download-url", "versionNumber", "userId", "createdAt", "updatedAt")
            VALUES (artifact_id, wrapper_id, 'Docker Image', 'Emulator', emulator_record."docker-url", 1, emulator_record."userId", NOW(), NOW());
            
            -- Set as latest artifact
            UPDATE "artifact_wrapper" SET "latestArtifactId" = artifact_id WHERE "id" = wrapper_id;
        END IF;

        -- If download-url exists, create an artifact for it
        IF emulator_record."download-url" IS NOT NULL THEN
            artifact_id := 'artifact_download_' || emulator_record.id;
            INSERT INTO "artifact" ("id", "wrapperId", "name", "artifactType", "download-url", "versionNumber", "userId", "createdAt", "updatedAt")
            VALUES (artifact_id, wrapper_id, 'Download', 'Emulator', emulator_record."download-url", 1, emulator_record."userId", NOW(), NOW());
            
            -- Set as latest artifact (will overwrite if docker-url was set, which is fine)
            UPDATE "artifact_wrapper" SET "latestArtifactId" = artifact_id WHERE "id" = wrapper_id;
        END IF;
    END LOOP;
END $$;

-- Drop old columns from device_artifact (now that data is migrated)
ALTER TABLE "device_artifact" DROP COLUMN "docker-url";
ALTER TABLE "device_artifact" DROP COLUMN "download-url";
ALTER TABLE "device_artifact" DROP COLUMN "helmSbomId";

-- DATA MIGRATION: Migrate Remediation deviceGroupId to _RemediationDeviceGroups
INSERT INTO "_RemediationDeviceGroups" ("A", "B")
SELECT "deviceGroupId", "id" FROM "remediation" WHERE "deviceGroupId" IS NOT NULL;

-- DATA MIGRATION: Migrate Remediation fix-uri to Artifacts
DO $$
DECLARE
    remediation_record RECORD;
    wrapper_id TEXT;
    artifact_id TEXT;
BEGIN
    FOR remediation_record IN SELECT * FROM "remediation" WHERE "fix-uri" IS NOT NULL LOOP
        -- Create ArtifactWrapper for this remediation
        wrapper_id := 'wrapper_rem_' || remediation_record.id;
        INSERT INTO "artifact_wrapper" ("id", "remediationId", "userId", "createdAt", "updatedAt")
        VALUES (wrapper_id, remediation_record.id, remediation_record."userId", NOW(), NOW());

        -- Create artifact for fix-uri
        artifact_id := 'artifact_fix_' || remediation_record.id;
        INSERT INTO "artifact" ("id", "wrapperId", "name", "artifactType", "download-url", "versionNumber", "userId", "createdAt", "updatedAt")
        VALUES (artifact_id, wrapper_id, 'Fix', 'Emulator', remediation_record."fix-uri", 1, remediation_record."userId", NOW(), NOW());
        
        -- Set as latest artifact
        UPDATE "artifact_wrapper" SET "latestArtifactId" = artifact_id WHERE "id" = wrapper_id;
    END LOOP;
END $$;

-- AlterTable remediation - drop migrated columns and make fields nullable
ALTER TABLE "remediation" DROP COLUMN "deviceGroupId";
ALTER TABLE "remediation" DROP COLUMN "fix-uri";
ALTER TABLE "remediation" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "remediation" ALTER COLUMN "narrative" DROP NOT NULL;
ALTER TABLE "remediation" ALTER COLUMN "upstream-api" DROP NOT NULL;
ALTER TABLE "remediation" ALTER COLUMN "vulnerabilityId" DROP NOT NULL;

-- AddForeignKey (recreate foreign keys with new names)
ALTER TABLE "artifact_wrapper" ADD CONSTRAINT "artifact_wrapper_deviceArtifactId_fkey" 
    FOREIGN KEY ("deviceArtifactId") REFERENCES "device_artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artifact_wrapper" ADD CONSTRAINT "artifact_wrapper_remediationId_fkey" 
    FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artifact_wrapper" ADD CONSTRAINT "artifact_wrapper_latestArtifactId_fkey" 
    FOREIGN KEY ("latestArtifactId") REFERENCES "artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artifact_wrapper" ADD CONSTRAINT "artifact_wrapper_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artifact" ADD CONSTRAINT "artifact_wrapperId_fkey" 
    FOREIGN KEY ("wrapperId") REFERENCES "artifact_wrapper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artifact" ADD CONSTRAINT "artifact_prevVersionId_fkey" 
    FOREIGN KEY ("prevVersionId") REFERENCES "artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artifact" ADD CONSTRAINT "artifact_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_artifact" ADD CONSTRAINT "device_artifact_deviceGroupId_fkey" 
    FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

--ALTER TABLE "device_artifact" ADD CONSTRAINT "device_artifact_userId_fkey" 
--    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vulnerability" ADD CONSTRAINT "vulnerability_deviceArtifactId_fkey" 
    FOREIGN KEY ("deviceArtifactId") REFERENCES "device_artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "_RemediationDeviceGroups" ADD CONSTRAINT "_RemediationDeviceGroups_A_fkey" 
    FOREIGN KEY ("A") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_RemediationDeviceGroups" ADD CONSTRAINT "_RemediationDeviceGroups_B_fkey" 
    FOREIGN KEY ("B") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
