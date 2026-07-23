-- CreateEnum
CREATE TYPE "PlanTagEnum" AS ENUM ('NETWORK_SEGMENTATION', 'DEVICE_UPDATE', 'FIRMWARE_UPDATE', 'VENDOR_FIX', 'NEEDS_VENDOR', 'CONFIG_CHANGE', 'ACCESS_CONTROL', 'MONITORING', 'COMPENSATING_CONTROL', 'DECOMMISSION');

-- AlterTable
ALTER TABLE "work_order_ticket" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mitigationPlanId" TEXT,
ADD COLUMN     "notificationId" TEXT,
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'Unsorted',
ADD COLUMN     "priorityReasonWhy" TEXT;

-- CreateTable
CREATE TABLE "mitigation_plan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "compareLine" TEXT,
    "tags" "PlanTagEnum"[],
    "cards" JSONB NOT NULL DEFAULT '{}',
    "notificationId" TEXT NOT NULL,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mitigation_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mitigation_plan_notificationId_idx" ON "mitigation_plan"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "mitigation_plan_notificationId_order_key" ON "mitigation_plan"("notificationId", "order");

-- CreateIndex
CREATE INDEX "work_order_ticket_mitigationPlanId_idx" ON "work_order_ticket"("mitigationPlanId");

-- CreateIndex
CREATE INDEX "work_order_ticket_notificationId_idx" ON "work_order_ticket"("notificationId");

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_mitigationPlanId_fkey" FOREIGN KEY ("mitigationPlanId") REFERENCES "mitigation_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mitigation_plan" ADD CONSTRAINT "mitigation_plan_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
