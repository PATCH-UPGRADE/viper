-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('Advisory', 'Recall', 'UpdateAvailable', 'Other');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('Email', 'PolledApi', 'Crawl');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('NeedsReview', 'Matched', 'Confirmed');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('Source', 'Link');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "tlp" "Tlp",
    "title" TEXT,
    "summary" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_source" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "sourceType" "NotificationSourceType" NOT NULL DEFAULT 'Source',
    "reasonWhy" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "externalId" TEXT,
    "referenceUrl" TEXT,
    "raw" JSONB NOT NULL,
    "markdown" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_attachment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "filename" TEXT,
    "contentType" TEXT,
    "downloadUrl" TEXT,
    "hash" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_read" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_read_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_asset_mapping" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "notification_asset_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_device_group_mapping" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "deviceGroupId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "notification_device_group_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_vulnerability_mapping" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "notification_vulnerability_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_remediation_mapping" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "remediationId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "notification_remediation_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_type_idx" ON "notification"("type");

-- CreateIndex
CREATE INDEX "notification_source_notificationId_idx" ON "notification_source"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_source_channel_externalId_key" ON "notification_source"("channel", "externalId");

-- CreateIndex
CREATE INDEX "notification_attachment_sourceId_idx" ON "notification_attachment"("sourceId");

-- CreateIndex
CREATE INDEX "notification_attachment_hash_idx" ON "notification_attachment"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "notification_read_notificationId_userId_key" ON "notification_read"("notificationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_asset_mapping_notificationId_assetId_key" ON "notification_asset_mapping"("notificationId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_device_group_mapping_notificationId_deviceGrou_key" ON "notification_device_group_mapping"("notificationId", "deviceGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_vulnerability_mapping_notificationId_vulnerabi_key" ON "notification_vulnerability_mapping"("notificationId", "vulnerabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_remediation_mapping_notificationId_remediation_key" ON "notification_remediation_mapping"("notificationId", "remediationId");

-- AddForeignKey
ALTER TABLE "notification_source" ADD CONSTRAINT "notification_source_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_attachment" ADD CONSTRAINT "notification_attachment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "notification_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_asset_mapping" ADD CONSTRAINT "notification_asset_mapping_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_asset_mapping" ADD CONSTRAINT "notification_asset_mapping_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_device_group_mapping" ADD CONSTRAINT "notification_device_group_mapping_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_device_group_mapping" ADD CONSTRAINT "notification_device_group_mapping_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_vulnerability_mapping" ADD CONSTRAINT "notification_vulnerability_mapping_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_vulnerability_mapping" ADD CONSTRAINT "notification_vulnerability_mapping_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_remediation_mapping" ADD CONSTRAINT "notification_remediation_mapping_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_remediation_mapping" ADD CONSTRAINT "notification_remediation_mapping_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
