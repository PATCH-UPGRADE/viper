-- Move the Notification*Mapping tables onto SourceRecord, split the ticket-owned
-- device group rows into their own table, and rename NotificationAttachment.
--
-- Every old row keeps its id. A notification-owned mapping moves to the
-- notification's primary source record: the record of its `Source` link, else
-- the record of its earliest link. A notification with no link loses its
-- mappings, and the count is raised as a NOTICE.

-- Everything below runs as one transaction, so a failure leaves the enum and
-- the old tables in place.
BEGIN;

-- AlterEnum
CREATE TYPE "MatchFeedbackTargetType_new" AS ENUM ('SourceRecordDeviceGroupMapping', 'SourceRecordAssetMapping', 'SourceRecordRemediationMapping', 'SourceRecordVulnerabilityMapping');
ALTER TABLE "match_feedback" ALTER COLUMN "targetType" TYPE "MatchFeedbackTargetType_new" USING (
  CASE "targetType"::text
    WHEN 'NotificationDeviceGroupMapping' THEN 'SourceRecordDeviceGroupMapping'
    WHEN 'NotificationAssetMapping' THEN 'SourceRecordAssetMapping'
    WHEN 'NotificationRemediationMapping' THEN 'SourceRecordRemediationMapping'
    WHEN 'NotificationVulnerabilityMapping' THEN 'SourceRecordVulnerabilityMapping'
  END
)::"MatchFeedbackTargetType_new";
ALTER TYPE "MatchFeedbackTargetType" RENAME TO "MatchFeedbackTargetType_old";
ALTER TYPE "MatchFeedbackTargetType_new" RENAME TO "MatchFeedbackTargetType";
DROP TYPE "public"."MatchFeedbackTargetType_old";

-- RenameTable: notification_attachment -> source_record_attachment, in place
ALTER TABLE "notification_attachment" RENAME TO "source_record_attachment";
ALTER TABLE "source_record_attachment" RENAME COLUMN "sourceId" TO "sourceRecordId";
ALTER TABLE "source_record_attachment" RENAME CONSTRAINT "notification_attachment_pkey" TO "source_record_attachment_pkey";
ALTER TABLE "source_record_attachment" RENAME CONSTRAINT "notification_attachment_sourceId_fkey" TO "source_record_attachment_sourceRecordId_fkey";
ALTER INDEX "notification_attachment_sourceId_idx" RENAME TO "source_record_attachment_sourceRecordId_idx";
ALTER INDEX "notification_attachment_hash_idx" RENAME TO "source_record_attachment_hash_idx";

-- CreateTable
CREATE TABLE "source_record_asset_mapping" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "source_record_asset_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record_device_group_mapping" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "deviceGroupMatchingId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "source_record_device_group_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record_vulnerability_mapping" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "source_record_vulnerability_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record_remediation_mapping" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "remediationId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "source_record_remediation_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_device_group_mapping" (
    "id" TEXT NOT NULL,
    "workOrderTicketId" TEXT NOT NULL,
    "deviceGroupMatchingId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel",
    "reasonWhy" TEXT,

    CONSTRAINT "work_order_device_group_mapping_pkey" PRIMARY KEY ("id")
);

-- MoveData: one primary source record per notification
CREATE TEMP TABLE "notification_primary_source" ON COMMIT DROP AS
SELECT DISTINCT ON ("notificationId") "notificationId", "sourceRecordId"
FROM "source_link"
WHERE "notificationId" IS NOT NULL
ORDER BY "notificationId", ("sourceType" = 'Source') DESC, "createdAt" ASC, "id" ASC;

DO $$
DECLARE
  orphaned integer;
BEGIN
  SELECT count(*) INTO orphaned FROM (
    SELECT "notificationId" FROM "notification_asset_mapping"
    UNION ALL SELECT "notificationId" FROM "notification_device_group_mapping" WHERE "notificationId" IS NOT NULL
    UNION ALL SELECT "notificationId" FROM "notification_vulnerability_mapping"
    UNION ALL SELECT "notificationId" FROM "notification_remediation_mapping"
  ) m
  WHERE NOT EXISTS (
    SELECT 1 FROM "notification_primary_source" p WHERE p."notificationId" = m."notificationId"
  );
  IF orphaned > 0 THEN
    RAISE NOTICE 'VW-518: dropping % notification mapping(s) whose notification has no source link', orphaned;
  END IF;
END $$;

-- A source record can feed two notifications, so two old rows can land on the
-- same (record, target) pair. One row is kept, and a Rejected row wins so that
-- a user's rejection survives. `confidence` is nullable, and DESC puts NULL
-- first, so NULLS LAST keeps a NULL row from beating a Rejected one.
INSERT INTO "source_record_asset_mapping" ("id", "sourceRecordId", "assetId", "confidence", "reasonWhy")
SELECT DISTINCT ON (p."sourceRecordId", m."assetId")
  m."id", p."sourceRecordId", m."assetId", m."confidence", m."reasonWhy"
FROM "notification_asset_mapping" m
JOIN "notification_primary_source" p ON p."notificationId" = m."notificationId"
ORDER BY p."sourceRecordId", m."assetId", (m."confidence" = 'Rejected') DESC NULLS LAST;

INSERT INTO "source_record_device_group_mapping" ("id", "sourceRecordId", "deviceGroupMatchingId", "confidence", "reasonWhy")
SELECT DISTINCT ON (p."sourceRecordId", m."deviceGroupMatchingId")
  m."id", p."sourceRecordId", m."deviceGroupMatchingId", m."confidence", m."reasonWhy"
FROM "notification_device_group_mapping" m
JOIN "notification_primary_source" p ON p."notificationId" = m."notificationId"
ORDER BY p."sourceRecordId", m."deviceGroupMatchingId", (m."confidence" = 'Rejected') DESC NULLS LAST;

INSERT INTO "source_record_vulnerability_mapping" ("id", "sourceRecordId", "vulnerabilityId", "confidence", "reasonWhy")
SELECT DISTINCT ON (p."sourceRecordId", m."vulnerabilityId")
  m."id", p."sourceRecordId", m."vulnerabilityId", m."confidence", m."reasonWhy"
FROM "notification_vulnerability_mapping" m
JOIN "notification_primary_source" p ON p."notificationId" = m."notificationId"
ORDER BY p."sourceRecordId", m."vulnerabilityId", (m."confidence" = 'Rejected') DESC NULLS LAST;

INSERT INTO "source_record_remediation_mapping" ("id", "sourceRecordId", "remediationId", "confidence", "reasonWhy")
SELECT DISTINCT ON (p."sourceRecordId", m."remediationId")
  m."id", p."sourceRecordId", m."remediationId", m."confidence", m."reasonWhy"
FROM "notification_remediation_mapping" m
JOIN "notification_primary_source" p ON p."notificationId" = m."notificationId"
ORDER BY p."sourceRecordId", m."remediationId", (m."confidence" = 'Rejected') DESC NULLS LAST;

INSERT INTO "work_order_device_group_mapping" ("id", "workOrderTicketId", "deviceGroupMatchingId", "confidence", "reasonWhy")
SELECT "id", "workOrderTicketId", "deviceGroupMatchingId", "confidence", "reasonWhy"
FROM "notification_device_group_mapping"
WHERE "workOrderTicketId" IS NOT NULL;

-- DropTable
DROP TABLE "notification_asset_mapping";
DROP TABLE "notification_device_group_mapping";
DROP TABLE "notification_remediation_mapping";
DROP TABLE "notification_vulnerability_mapping";

-- CreateIndex
CREATE INDEX "source_record_asset_mapping_assetId_idx" ON "source_record_asset_mapping"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_asset_mapping_sourceRecordId_assetId_key" ON "source_record_asset_mapping"("sourceRecordId", "assetId");

-- CreateIndex
CREATE INDEX "source_record_device_group_mapping_deviceGroupMatchingId_idx" ON "source_record_device_group_mapping"("deviceGroupMatchingId");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_device_group_mapping_sourceRecordId_deviceGro_key" ON "source_record_device_group_mapping"("sourceRecordId", "deviceGroupMatchingId");

-- CreateIndex
CREATE INDEX "source_record_vulnerability_mapping_vulnerabilityId_idx" ON "source_record_vulnerability_mapping"("vulnerabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_vulnerability_mapping_sourceRecordId_vulnerab_key" ON "source_record_vulnerability_mapping"("sourceRecordId", "vulnerabilityId");

-- CreateIndex
CREATE INDEX "source_record_remediation_mapping_remediationId_idx" ON "source_record_remediation_mapping"("remediationId");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_remediation_mapping_sourceRecordId_remediatio_key" ON "source_record_remediation_mapping"("sourceRecordId", "remediationId");

-- CreateIndex
CREATE INDEX "work_order_device_group_mapping_deviceGroupMatchingId_idx" ON "work_order_device_group_mapping"("deviceGroupMatchingId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_device_group_mapping_workOrderTicketId_deviceGro_key" ON "work_order_device_group_mapping"("workOrderTicketId", "deviceGroupMatchingId");

-- AddForeignKey
ALTER TABLE "source_record_asset_mapping" ADD CONSTRAINT "source_record_asset_mapping_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_asset_mapping" ADD CONSTRAINT "source_record_asset_mapping_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_device_group_mapping" ADD CONSTRAINT "source_record_device_group_mapping_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_device_group_mapping" ADD CONSTRAINT "source_record_device_group_mapping_deviceGroupMatchingId_fkey" FOREIGN KEY ("deviceGroupMatchingId") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_vulnerability_mapping" ADD CONSTRAINT "source_record_vulnerability_mapping_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_vulnerability_mapping" ADD CONSTRAINT "source_record_vulnerability_mapping_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_remediation_mapping" ADD CONSTRAINT "source_record_remediation_mapping_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_remediation_mapping" ADD CONSTRAINT "source_record_remediation_mapping_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_device_group_mapping" ADD CONSTRAINT "work_order_device_group_mapping_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_device_group_mapping" ADD CONSTRAINT "work_order_device_group_mapping_deviceGroupMatchingId_fkey" FOREIGN KEY ("deviceGroupMatchingId") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
