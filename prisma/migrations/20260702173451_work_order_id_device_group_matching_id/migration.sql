/*
  Warnings:

  - A unique constraint covering the columns `[workOrderTicketId,deviceGroupMatchingId]` on the table `notification_device_group_mapping` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ndg_mapping_workorder_devicegroupmatching_key" ON "notification_device_group_mapping"("workOrderTicketId", "deviceGroupMatchingId");
