/*
  Warnings:

  - You are about to drop the `_AdvisoryMatchings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AdvisoryVulnerabilities` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_WorkOrderTicketAdvisories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `advisory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `external_advisory_mappings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_AdvisoryMatchings" DROP CONSTRAINT "_AdvisoryMatchings_A_fkey";

-- DropForeignKey
ALTER TABLE "_AdvisoryMatchings" DROP CONSTRAINT "_AdvisoryMatchings_B_fkey";

-- DropForeignKey
ALTER TABLE "_AdvisoryVulnerabilities" DROP CONSTRAINT "_AdvisoryVulnerabilities_A_fkey";

-- DropForeignKey
ALTER TABLE "_AdvisoryVulnerabilities" DROP CONSTRAINT "_AdvisoryVulnerabilities_B_fkey";

-- DropForeignKey
ALTER TABLE "_WorkOrderTicketAdvisories" DROP CONSTRAINT "_WorkOrderTicketAdvisories_A_fkey";

-- DropForeignKey
ALTER TABLE "_WorkOrderTicketAdvisories" DROP CONSTRAINT "_WorkOrderTicketAdvisories_B_fkey";

-- DropForeignKey
ALTER TABLE "advisory" DROP CONSTRAINT "advisory_userId_fkey";

-- DropForeignKey
ALTER TABLE "external_advisory_mappings" DROP CONSTRAINT "external_advisory_mappings_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "external_advisory_mappings" DROP CONSTRAINT "external_advisory_mappings_itemId_fkey";

-- DropTable
DROP TABLE "_AdvisoryMatchings";

-- DropTable
DROP TABLE "_AdvisoryVulnerabilities";

-- DropTable
DROP TABLE "_WorkOrderTicketAdvisories";

-- DropTable
DROP TABLE "advisory";

-- DropTable
DROP TABLE "external_advisory_mappings";
