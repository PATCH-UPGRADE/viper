/*
  Warnings:

  - You are about to drop the column `deviceGroupId` on the `notification_device_group_mapping` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[notificationId,deviceGroupMatchingId]` on the table `notification_device_group_mapping` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deviceGroupMatchingId` to the `notification_device_group_mapping` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "notification_device_group_mapping" DROP CONSTRAINT "notification_device_group_mapping_deviceGroupId_fkey";

-- DropIndex
DROP INDEX "notification_device_group_mapping_notificationId_deviceGrou_key";

-- AlterTable
ALTER TABLE "notification_device_group_mapping" DROP COLUMN "deviceGroupId",
ADD COLUMN     "deviceGroupMatchingId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "notification_device_group_mapping_notificationId_deviceGrou_key" ON "notification_device_group_mapping"("notificationId", "deviceGroupMatchingId");

-- AddForeignKey
ALTER TABLE "notification_device_group_mapping" ADD CONSTRAINT "notification_device_group_mapping_deviceGroupMatchingId_fkey" FOREIGN KEY ("deviceGroupMatchingId") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;
