/*
  Warnings:

  - You are about to drop the column `lastSynced` on the `asset` table. All the data in the column will be lost.
  - You are about to drop the column `assetId` on the `external_asset_mappings` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `sync_status` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[itemId,integrationId]` on the table `external_asset_mappings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `itemId` to the `external_asset_mappings` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SyncStatusEnum" AS ENUM ('Error', 'Pending', 'Success');

-- DropForeignKey
ALTER TABLE "public"."external_asset_mappings" DROP CONSTRAINT "external_asset_mappings_assetId_fkey";

-- DropIndex
DROP INDEX "public"."external_asset_mappings_assetId_idx";

-- DropIndex
DROP INDEX "public"."external_asset_mappings_assetId_integrationId_key";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "lastSynced";

-- AlterTable
ALTER TABLE "external_asset_mappings" DROP COLUMN "assetId",
ADD COLUMN     "itemId" TEXT NOT NULL,
ADD COLUMN     "lastSynced" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sync_status" DROP COLUMN "error",
ADD COLUMN     "status" "SyncStatusEnum" NOT NULL DEFAULT 'Pending';

-- CreateTable
CREATE TABLE "external_item_mappings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSynced" TIMESTAMP(3),

    CONSTRAINT "external_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_item_mappings_itemId_idx" ON "external_item_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_item_mappings_itemId_integrationId_key" ON "external_item_mappings"("itemId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_item_mappings_integrationId_externalId_key" ON "external_item_mappings"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "external_asset_mappings_itemId_idx" ON "external_asset_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_asset_mappings_itemId_integrationId_key" ON "external_asset_mappings"("itemId", "integrationId");

-- AddForeignKey
ALTER TABLE "external_asset_mappings" ADD CONSTRAINT "external_asset_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_item_mappings" ADD CONSTRAINT "external_item_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_item_mappings" ADD CONSTRAINT "external_item_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
