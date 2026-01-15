/*
  Warnings:

  - You are about to drop the column `assetId` on the `emulator` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."emulator" DROP CONSTRAINT "emulator_assetId_fkey";

-- AlterTable
ALTER TABLE "emulator" DROP COLUMN "assetId";
