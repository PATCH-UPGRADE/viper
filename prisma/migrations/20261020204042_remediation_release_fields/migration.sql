/*
  Warnings:

  - The `category` column on the `remediation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RemediationCategory" AS ENUM ('SOFTWARE_UPDATE', 'HARDWARE_PATCH', 'FIREWALL_RULE', 'OTHER');

-- AlterTable
ALTER TABLE "remediation" ADD COLUMN     "isManufacturerRemediation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSecurityUpdate" BOOLEAN,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
DROP COLUMN "category",
ADD COLUMN     "category" "RemediationCategory";
