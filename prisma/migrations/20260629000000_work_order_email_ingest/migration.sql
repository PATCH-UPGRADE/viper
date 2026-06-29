-- WorkOrderTicket: drop the TicketSource enum column; add general body +
-- suggested-assignee fields. `sourceLabel` is kept as a free-text label.
ALTER TABLE "work_order_ticket" DROP COLUMN "source";
DROP TYPE "TicketSource";
ALTER TABLE "work_order_ticket" ADD COLUMN "body" TEXT;
ALTER TABLE "work_order_ticket" ADD COLUMN "suggestedAssignee" TEXT;

-- NotificationSource: reuse for work orders (a source belongs to a Notification
-- OR a WorkOrderTicket). notificationId is already nullable.
ALTER TABLE "notification_source" ADD COLUMN "workOrderTicketId" TEXT;
CREATE INDEX "notification_source_workOrderTicketId_idx" ON "notification_source"("workOrderTicketId");
ALTER TABLE "notification_source" ADD CONSTRAINT "notification_source_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NotificationDeviceGroupMapping: dual FK so device-group matches can attach to
-- either a Notification or a WorkOrderTicket.
ALTER TABLE "notification_device_group_mapping" ALTER COLUMN "notificationId" DROP NOT NULL;
ALTER TABLE "notification_device_group_mapping" ADD COLUMN "workOrderTicketId" TEXT;
CREATE INDEX "notification_device_group_mapping_workOrderTicketId_idx" ON "notification_device_group_mapping"("workOrderTicketId");
CREATE UNIQUE INDEX "ndg_mapping_workorder_devicegroup_key" ON "notification_device_group_mapping"("workOrderTicketId", "deviceGroupId");
ALTER TABLE "notification_device_group_mapping" ADD CONSTRAINT "notification_device_group_mapping_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
