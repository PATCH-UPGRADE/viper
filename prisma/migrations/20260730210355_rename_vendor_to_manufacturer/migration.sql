-- Rename the canonical registry table and its own constraints.
ALTER TABLE "vendor" RENAME TO "manufacturer";
ALTER TABLE "manufacturer" RENAME CONSTRAINT "vendor_pkey" TO "manufacturer_pkey";
ALTER INDEX "vendor_canonicalName_key" RENAME TO "manufacturer_canonicalName_key";
ALTER INDEX "vendor_canonicalName_idx" RENAME TO "manufacturer_canonicalName_idx";

-- device_group foreign key column and its constraints.
ALTER TABLE "device_group" RENAME COLUMN "vendorId" TO "manufacturerId";
ALTER TABLE "device_group" RENAME CONSTRAINT "device_group_vendorId_fkey" TO "device_group_manufacturerId_fkey";
ALTER INDEX "device_group_vendorId_productId_idx" RENAME TO "device_group_manufacturerId_productId_idx";
-- Short explicit name: the Prisma-generated one would exceed Postgres' 63-char limit.
ALTER INDEX "device_group_vendorId_productId_versionId_versionStatus_key" RENAME TO "device_group_identity_key";

-- device_group_matching foreign key column and its constraints.
ALTER TABLE "device_group_matching" RENAME COLUMN "vendorId" TO "manufacturerId";
ALTER TABLE "device_group_matching" RENAME CONSTRAINT "device_group_matching_vendorId_fkey" TO "device_group_matching_manufacturerId_fkey";
ALTER INDEX "device_group_matching_vendorId_productId_idx" RENAME TO "device_group_matching_manufacturerId_productId_idx";

-- EntityFilter.filter stores a Prisma `where` fragment as jsonb. Those blobs are
-- re-validated against the Zod allowlist on every hourly resolve tick, so a stale
-- `vendorId` key would make the filter silently stop matching. Only the quoted key
-- token is rewritten; no allowlisted value is ever the literal string "vendorId".
UPDATE "entity_filter"
SET "filter" = replace("filter"::text, '"vendorId"', '"manufacturerId"')::jsonb
WHERE "filter"::text LIKE '%"vendorId"%';
