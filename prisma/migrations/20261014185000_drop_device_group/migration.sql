-- HAND-EDITED PROLOGUE. Device data is deliberately NOT migrated: existing
-- products have no manufacturer, and one version row can belong to many
-- products, so these rows cannot move to the new shape. The seed and the
-- integrations repopulate them. Manufacturers stay.
--
-- Cascades: assets take their issues, asset tickets, notification and node
-- links, and external mappings. Products and versions take every device group
-- matching that names them. Manufacturer-wide matchings (no product) stay.
-- ════════════════════════════════════════════════════════════════════════════
DELETE FROM "asset";
DELETE FROM "device_group";
DELETE FROM "version";
DELETE FROM "product";
-- ════════════════════════════════════════════════════════════════════════════

-- Saved asset filters move from the removed deviceGroup hop to the asset: the
-- hop's contents join an AND on the asset, and udi becomes version.udiDi.
-- Filters on deviceGroupId stay as they are: those ids no longer exist, and
-- dropping the key would widen the filter. The resolver skips them.
CREATE FUNCTION pg_temp.lift_device_group(j jsonb, inside boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  lifted jsonb := '[]'::jsonb;
  k text;
  v jsonb;
BEGIN
  IF jsonb_typeof(j) = 'array' THEN
    RETURN (SELECT coalesce(jsonb_agg(pg_temp.lift_device_group(e, inside)), '[]'::jsonb)
            FROM jsonb_array_elements(j) e);
  END IF;
  IF jsonb_typeof(j) IS DISTINCT FROM 'object' THEN
    RETURN j;
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(j) LOOP
    IF k IN ('AND', 'OR', 'NOT') THEN
      result := result || jsonb_build_object(k, pg_temp.lift_device_group(v, inside));
    ELSIF NOT inside AND k = 'deviceGroup' THEN
      lifted := lifted || jsonb_build_array(pg_temp.lift_device_group(v, true));
    ELSIF inside AND k = 'udi' THEN
      result := result || jsonb_build_object('version', jsonb_build_object('udiDi', v));
    ELSE
      result := result || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  IF jsonb_array_length(lifted) > 0 THEN
    result := jsonb_set(result, '{AND}', coalesce(result -> 'AND', '[]'::jsonb) || lifted);
  END IF;
  RETURN result;
END;
$$;

UPDATE "entity_filter"
SET "filter" = pg_temp.lift_device_group("filter", false)
WHERE "targetModel" = 'ASSET'
  AND "filter"::text LIKE '%"deviceGroup"%'
  AND "filter"::text NOT LIKE '%"deviceGroupId"%';

DROP FUNCTION pg_temp.lift_device_group(jsonb, boolean);

-- DropForeignKey
ALTER TABLE "asset" DROP CONSTRAINT "asset_deviceGroupId_fkey";

-- DropForeignKey
ALTER TABLE "device_group" DROP CONSTRAINT "device_group_manufacturerId_fkey";

-- DropForeignKey
ALTER TABLE "device_group" DROP CONSTRAINT "device_group_productId_fkey";

-- DropForeignKey
ALTER TABLE "device_group" DROP CONSTRAINT "device_group_versionId_fkey";

-- DropForeignKey
ALTER TABLE "device_group_history" DROP CONSTRAINT "device_group_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "device_group_history" DROP CONSTRAINT "device_group_history_deviceGroupId_fkey";

-- DropIndex
DROP INDEX "asset_deviceGroupId_idx";

-- DropIndex
DROP INDEX "product_canonicalName_key";

-- DropIndex
DROP INDEX "version_canonicalName_key";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "deviceGroupId",
ADD COLUMN     "manufacturerId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "versionId" TEXT,
ADD COLUMN     "versionStatus" "VersionStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "manufacturer" DROP COLUMN "hasCpe";

-- AlterTable
ALTER TABLE "product" DROP COLUMN "hasCpe",
ADD COLUMN     "manufacturerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "version" DROP COLUMN "hasCpe",
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "udiDi" TEXT;

-- DropTable
DROP TABLE "device_group";

-- DropTable
DROP TABLE "device_group_history";

-- CreateIndex
CREATE INDEX "asset_versionId_idx" ON "asset"("versionId");

-- CreateIndex
CREATE INDEX "asset_manufacturerId_productId_idx" ON "asset"("manufacturerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_manufacturerId_canonicalName_key" ON "product"("manufacturerId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "product_manufacturerId_id_key" ON "product"("manufacturerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "version_udiDi_key" ON "version"("udiDi");

-- CreateIndex
CREATE UNIQUE INDEX "version_productId_canonicalName_key" ON "version"("productId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "version_productId_id_key" ON "version"("productId", "id");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version" ADD CONSTRAINT "version_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_manufacturerId_productId_fkey" FOREIGN KEY ("manufacturerId", "productId") REFERENCES "product"("manufacturerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_productId_versionId_fkey" FOREIGN KEY ("productId", "versionId") REFERENCES "version"("productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys above skip a row when one column of the pair is
-- null (MATCH SIMPLE). These checks close that gap: an asset's product needs
-- its manufacturer, and its version needs its product. Prisma cannot express
-- a CHECK, so the schema does not show them.
ALTER TABLE "asset" ADD CONSTRAINT "asset_product_needs_manufacturer"
  CHECK ("productId" IS NULL OR "manufacturerId" IS NOT NULL);
ALTER TABLE "asset" ADD CONSTRAINT "asset_version_needs_product"
  CHECK ("versionId" IS NULL OR "productId" IS NOT NULL);