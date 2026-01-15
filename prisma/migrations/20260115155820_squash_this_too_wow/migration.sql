/*
  Warnings:

  - You are about to drop the column `cpe` on the `remediation` table. All the data in the column will be lost.
  - Added the required column `deviceGroupId` to the `remediation` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."remediation_cpe_idx";

-- AlterTable
ALTER TABLE "remediation" DROP COLUMN "cpe",
ADD COLUMN     "deviceGroupId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "remediation_deviceGroupId_idx" ON "remediation"("deviceGroupId");

-- AddForeignKey
ALTER TABLE "remediation" ADD CONSTRAINT "remediation_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
