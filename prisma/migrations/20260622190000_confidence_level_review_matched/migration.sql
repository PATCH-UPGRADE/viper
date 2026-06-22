/*
  Warnings:

  - The values [Guess] on the enum `ConfidenceLevel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ConfidenceLevel_new" AS ENUM ('NeedsReview', 'Matched', 'Confirmed');
ALTER TABLE "notification_asset_mapping" ALTER COLUMN "confidence" TYPE "ConfidenceLevel_new" USING ("confidence"::text::"ConfidenceLevel_new");
ALTER TABLE "notification_device_group_mapping" ALTER COLUMN "confidence" TYPE "ConfidenceLevel_new" USING ("confidence"::text::"ConfidenceLevel_new");
ALTER TABLE "notification_vulnerability_mapping" ALTER COLUMN "confidence" TYPE "ConfidenceLevel_new" USING ("confidence"::text::"ConfidenceLevel_new");
ALTER TABLE "notification_remediation_mapping" ALTER COLUMN "confidence" TYPE "ConfidenceLevel_new" USING ("confidence"::text::"ConfidenceLevel_new");
ALTER TYPE "ConfidenceLevel" RENAME TO "ConfidenceLevel_old";
ALTER TYPE "ConfidenceLevel_new" RENAME TO "ConfidenceLevel";
DROP TYPE "public"."ConfidenceLevel_old";
COMMIT;
