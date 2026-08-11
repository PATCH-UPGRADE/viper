/*
  Warnings:

  - You are about to drop the column `upstream-api` on the `asset` table. All the data in the column will be lost.
  - You are about to drop the column `upstream-api` on the `device_artifact` table. All the data in the column will be lost.
  - You are about to drop the column `authType` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `authentication` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `integration-uri` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `integrationType` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `lastSuccessfulSync` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `resourceType` on the `integration` table. All the data in the column will be lost.
  - You are about to drop the column `upstream-api` on the `remediation` table. All the data in the column will be lost.
  - You are about to drop the column `upstream-api` on the `vulnerability` table. All the data in the column will be lost.
  - You are about to drop the `contract_asset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `integration_session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_source` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sync_status` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[managesRelationshipId]` on the table `contract` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `platform` to the `integration` table without a default value. This is not possible if the table is not empty.

*/

-- ════════════════════════════════════════════════════════════════════════════
-- HAND-EDITED PROLOGUE. Integration state is deliberately NOT migrated; every
-- integration must be re-created after this lands. Non-integration data —
-- assets, work orders, notifications, vulnerabilities — survives.
-- ════════════════════════════════════════════════════════════════════════════

-- Source records first, as a DELETE rather than relying on the DROP TABLE below:
-- notification_attachment.sourceId is ON DELETE CASCADE, so DELETE takes the
-- attachments with it. DROP TABLE only drops the FK and would leave orphan
-- attachment rows, which then break the re-pointed FK at the end of this file.
DELETE FROM "notification_source";

-- api_key_connector.integrationId is SET NULL, so deleting integrations first
-- would leave these as zombies owned by neither an ApiKey nor an Integration.
-- Rows owned by an ApiKey (integrationId IS NULL) are untouched.
DELETE FROM "api_key_connector" WHERE "integrationId" IS NOT NULL;

-- Cascades to sync_status and all five external_*_mappings. Also makes the
-- `platform` NOT NULL column below addable without a default.
--
-- !! DO NOT delete the shadow integration users. Asset.userId,
-- !! Vulnerability.userId and Remediation.userId are all ON DELETE CASCADE, so
-- !! dropping a shadow user deletes every row that integration ever ingested.
-- !! Orphan shadow users are harmless and stay.
DELETE FROM "integration";

-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "PlatformEnum" AS ENUM ('AI', 'PARTNER', 'FLEET');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('Email', 'Integration', 'TA4');

-- CreateEnum
CREATE TYPE "SourceLinkType" AS ENUM ('Source', 'Link');

-- AlterEnum
ALTER TYPE "ResourceType" ADD VALUE 'SourceRecord';

-- DropForeignKey
ALTER TABLE "contract_asset" DROP CONSTRAINT "contract_asset_assetId_fkey";

-- DropForeignKey
ALTER TABLE "contract_asset" DROP CONSTRAINT "contract_asset_contractId_fkey";

-- DropForeignKey
ALTER TABLE "notification_attachment" DROP CONSTRAINT "notification_attachment_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "notification_source" DROP CONSTRAINT "notification_source_notificationId_fkey";

-- DropForeignKey
ALTER TABLE "notification_source" DROP CONSTRAINT "notification_source_workOrderTicketId_fkey";

-- DropForeignKey
ALTER TABLE "sync_status" DROP CONSTRAINT "sync_status_integrationId_fkey";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "upstream-api";

-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "managesRelationshipId" TEXT;

-- AlterTable
ALTER TABLE "device_artifact" DROP COLUMN "upstream-api";

-- AlterTable
ALTER TABLE "external_asset_mappings" ADD COLUMN     "upstreamApi" TEXT,
ADD COLUMN     "webUrl" TEXT;

-- AlterTable
ALTER TABLE "external_device_artifact_mappings" ADD COLUMN     "upstreamApi" TEXT,
ADD COLUMN     "webUrl" TEXT;

-- AlterTable
ALTER TABLE "external_item_mappings" ADD COLUMN     "upstreamApi" TEXT,
ADD COLUMN     "webUrl" TEXT;

-- AlterTable
ALTER TABLE "external_remediation_mappings" ADD COLUMN     "upstreamApi" TEXT,
ADD COLUMN     "webUrl" TEXT;

-- AlterTable
ALTER TABLE "external_work_order_mappings" ADD COLUMN     "upstreamApi" TEXT,
ADD COLUMN     "webUrl" TEXT;

-- AlterTable
ALTER TABLE "integration" DROP COLUMN "authType",
DROP COLUMN "authentication",
DROP COLUMN "integration-uri",
DROP COLUMN "integrationType",
DROP COLUMN "lastSuccessfulSync",
DROP COLUMN "prompt",
DROP COLUMN "resourceType",
ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "credentials" BYTEA,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "platform",
ADD COLUMN     "platform" "PlatformEnum" NOT NULL,
ALTER COLUMN "syncEvery" DROP NOT NULL;

-- AlterTable
ALTER TABLE "remediation" DROP COLUMN "upstream-api";

-- AlterTable
ALTER TABLE "vulnerability" DROP COLUMN "upstream-api";

-- DropTable
DROP TABLE "contract_asset";

-- DropTable
DROP TABLE "integration_session";

-- DropTable
DROP TABLE "notification_source";

-- DropTable
DROP TABLE "sync_status";

-- DropEnum
DROP TYPE "IntegrationType";

-- DropEnum
DROP TYPE "NotificationChannel";

-- DropEnum
DROP TYPE "NotificationSourceType";

-- CreateTable
CREATE TABLE "manages_relationship" (
    "id" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "departmentId" TEXT,
    "vendorId" TEXT,
    "workOrderIntegrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manages_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_resource_sync" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "resource" "ResourceType" NOT NULL,
    "cursor" JSONB,
    "status" "SyncStatusEnum" NOT NULL DEFAULT 'Pending',
    "errorMessage" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSync" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "syncEvery" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_resource_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record" (
    "id" TEXT NOT NULL,
    "channel" "SourceChannel" NOT NULL,
    "mappingId" TEXT,
    "contentHash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "markdown" TEXT,
    "externalId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remediationId" TEXT,

    CONSTRAINT "source_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_link" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "notificationId" TEXT,
    "workOrderTicketId" TEXT,
    "sourceType" "SourceLinkType" NOT NULL DEFAULT 'Source',
    "reasonWhy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_source_record_mappings" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "upstreamApi" TEXT,
    "webUrl" TEXT,
    "lastSynced" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_source_record_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ManagedAssets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ManagedAssets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "manages_relationship_departmentId_idx" ON "manages_relationship"("departmentId");

-- CreateIndex
CREATE INDEX "manages_relationship_vendorId_idx" ON "manages_relationship"("vendorId");

-- CreateIndex
CREATE INDEX "manages_relationship_workOrderIntegrationId_idx" ON "manages_relationship"("workOrderIntegrationId");

-- CreateIndex
CREATE INDEX "integration_resource_sync_integrationId_idx" ON "integration_resource_sync"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_resource_sync_integrationId_resource_key" ON "integration_resource_sync"("integrationId", "resource");

-- CreateIndex
CREATE INDEX "source_record_mappingId_observedAt_idx" ON "source_record"("mappingId", "observedAt");

-- CreateIndex
CREATE INDEX "source_record_remediationId_idx" ON "source_record"("remediationId");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_channel_externalId_key" ON "source_record"("channel", "externalId");

-- CreateIndex
CREATE INDEX "source_link_notificationId_idx" ON "source_link"("notificationId");

-- CreateIndex
CREATE INDEX "source_link_workOrderTicketId_idx" ON "source_link"("workOrderTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "source_link_sourceRecordId_notificationId_key" ON "source_link"("sourceRecordId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "source_link_sourceRecordId_workOrderTicketId_key" ON "source_link"("sourceRecordId", "workOrderTicketId");

-- CreateIndex
CREATE INDEX "external_source_record_mappings_integrationId_idx" ON "external_source_record_mappings"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_source_record_mappings_integrationId_externalId_key" ON "external_source_record_mappings"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "_ManagedAssets_B_index" ON "_ManagedAssets"("B");

-- CreateIndex
CREATE UNIQUE INDEX "contract_managesRelationshipId_key" ON "contract"("managesRelationshipId");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_managesRelationshipId_fkey" FOREIGN KEY ("managesRelationshipId") REFERENCES "manages_relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manages_relationship" ADD CONSTRAINT "manages_relationship_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manages_relationship" ADD CONSTRAINT "manages_relationship_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manages_relationship" ADD CONSTRAINT "manages_relationship_workOrderIntegrationId_fkey" FOREIGN KEY ("workOrderIntegrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_resource_sync" ADD CONSTRAINT "integration_resource_sync_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "external_source_record_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_link" ADD CONSTRAINT "source_link_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_link" ADD CONSTRAINT "source_link_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_link" ADD CONSTRAINT "source_link_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_source_record_mappings" ADD CONSTRAINT "external_source_record_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_attachment" ADD CONSTRAINT "notification_attachment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ManagedAssets" ADD CONSTRAINT "_ManagedAssets_A_fkey" FOREIGN KEY ("A") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ManagedAssets" ADD CONSTRAINT "_ManagedAssets_B_fkey" FOREIGN KEY ("B") REFERENCES "manages_relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
