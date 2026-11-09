/*
  Warnings:

  - A unique constraint covering the columns `[itemId]` on the table `external_vulnerability_record_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[itemId]` on the table `external_work_order_mappings` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "external_vulnerability_record_mappings_itemId_idx";

-- DropIndex
DROP INDEX "external_vulnerability_record_mappings_itemId_integrationId_key";

-- DropIndex
DROP INDEX "external_work_order_mappings_itemId_idx";

-- DropIndex
DROP INDEX "external_work_order_mappings_itemId_integrationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "external_vulnerability_record_mappings_itemId_key" ON "external_vulnerability_record_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_work_order_mappings_itemId_key" ON "external_work_order_mappings"("itemId");
