-- AlterTable
ALTER TABLE "device_group_matching" ADD COLUMN "versionStatus" "VersionStatus" NOT NULL DEFAULT 'KNOWN';

-- The identity key keeps NULLS NOT DISTINCT, which Prisma cannot express, so a
-- generated migration would drop it and allow duplicate product-level rows.
DROP INDEX "device_group_matching_identity_key";
CREATE UNIQUE INDEX "device_group_matching_identity_key" ON "device_group_matching"("manufacturerId", "productId", "versionId", "versionRange", "versionStatus") NULLS NOT DISTINCT;
