-- Work-order ticket tracking + email-ingest schema (squashed).
-- Replaces the per-step branch migrations: add_work_ticket_tracking,
-- watch_tickets, ticket_source_schema, restore_ticket_seen,
-- work_order_email_ingest. Net schema only (churn removed).

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'REQUIRES_APPROVAL', 'DONE');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('PATCH', 'CONFIG_CHANGE', 'VULN_REMEDIATION', 'ADVISORY_RESPONSE', 'CLINICAL_REVIEW', 'FIRMWARE_UPDATE', 'NETWORK_REMEDIATION', 'NEW_ASSET_PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketActivityType" AS ENUM ('STATUS_CHANGED', 'CATEGORY_CHANGED', 'ASSIGNEE_CHANGED', 'DEPARTMENTS_CHANGED', 'SCHEDULED_AT_CHANGED', 'SUMMARY_CHANGED', 'DESCRIPTION_CHANGED', 'CHILD_ATTACHED', 'CHILD_DETACHED', 'ASSET_ATTACHED', 'ASSET_DETACHED');

-- AlterTable
ALTER TABLE "notification_device_group_mapping" ADD COLUMN     "workOrderTicketId" TEXT,
ALTER COLUMN "notificationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "notification_source" ADD COLUMN     "workOrderTicketId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_color" (
    "id" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_ticket" (
    "id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'TO_DO',
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "sourceLabel" TEXT,
    "body" TEXT,
    "suggestedAssignee" TEXT,
    "parentId" TEXT,
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "lastCommentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_watch" (
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watch_pkey" PRIMARY KEY ("userId","ticketId")
);

-- CreateTable
CREATE TABLE "ticket_seen" (
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_seen_pkey" PRIMARY KEY ("userId","ticketId")
);

-- CreateTable
CREATE TABLE "ticket_activity" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TicketActivityType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_description" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_description_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketAssets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketAssets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketVulns" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketVulns_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketIssues" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketIssues_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketRemediations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketRemediations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketAdvisories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketAdvisories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WorkOrderTicketDepartments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WorkOrderTicketDepartments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "category_color_category_key" ON "category_color"("category");

-- CreateIndex
CREATE INDEX "work_order_ticket_status_idx" ON "work_order_ticket"("status");

-- CreateIndex
CREATE INDEX "work_order_ticket_assigneeId_idx" ON "work_order_ticket"("assigneeId");

-- CreateIndex
CREATE INDEX "work_order_ticket_creatorId_idx" ON "work_order_ticket"("creatorId");

-- CreateIndex
CREATE INDEX "work_order_ticket_parentId_idx" ON "work_order_ticket"("parentId");

-- CreateIndex
CREATE INDEX "ticket_watch_userId_idx" ON "ticket_watch"("userId");

-- CreateIndex
CREATE INDEX "ticket_watch_ticketId_idx" ON "ticket_watch"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_seen_userId_idx" ON "ticket_seen"("userId");

-- CreateIndex
CREATE INDEX "ticket_seen_ticketId_idx" ON "ticket_seen"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_activity_ticketId_createdAt_idx" ON "ticket_activity"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_activity_userId_idx" ON "ticket_activity"("userId");

-- CreateIndex
CREATE INDEX "ticket_comment_ticketId_createdAt_idx" ON "ticket_comment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_comment_authorId_idx" ON "ticket_comment"("authorId");

-- CreateIndex
CREATE INDEX "ticket_description_departmentId_idx" ON "ticket_description"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_description_ticketId_departmentId_key" ON "ticket_description"("ticketId", "departmentId");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketAssets_B_index" ON "_WorkOrderTicketAssets"("B");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketVulns_B_index" ON "_WorkOrderTicketVulns"("B");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketIssues_B_index" ON "_WorkOrderTicketIssues"("B");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketRemediations_B_index" ON "_WorkOrderTicketRemediations"("B");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketAdvisories_B_index" ON "_WorkOrderTicketAdvisories"("B");

-- CreateIndex
CREATE INDEX "_WorkOrderTicketDepartments_B_index" ON "_WorkOrderTicketDepartments"("B");

-- CreateIndex
CREATE INDEX "notification_device_group_mapping_workOrderTicketId_idx" ON "notification_device_group_mapping"("workOrderTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "ndg_mapping_workorder_devicegroup_key" ON "notification_device_group_mapping"("workOrderTicketId", "deviceGroupId");

-- CreateIndex
CREATE INDEX "notification_source_workOrderTicketId_idx" ON "notification_source"("workOrderTicketId");

-- CreateIndex
CREATE INDEX "user_departmentId_idx" ON "user"("departmentId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watch" ADD CONSTRAINT "ticket_watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watch" ADD CONSTRAINT "ticket_watch_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_description" ADD CONSTRAINT "ticket_description_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_description" ADD CONSTRAINT "ticket_description_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_source" ADD CONSTRAINT "notification_source_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_device_group_mapping" ADD CONSTRAINT "notification_device_group_mapping_workOrderTicketId_fkey" FOREIGN KEY ("workOrderTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketAssets" ADD CONSTRAINT "_WorkOrderTicketAssets_A_fkey" FOREIGN KEY ("A") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketAssets" ADD CONSTRAINT "_WorkOrderTicketAssets_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketVulns" ADD CONSTRAINT "_WorkOrderTicketVulns_A_fkey" FOREIGN KEY ("A") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketVulns" ADD CONSTRAINT "_WorkOrderTicketVulns_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketIssues" ADD CONSTRAINT "_WorkOrderTicketIssues_A_fkey" FOREIGN KEY ("A") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketIssues" ADD CONSTRAINT "_WorkOrderTicketIssues_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketRemediations" ADD CONSTRAINT "_WorkOrderTicketRemediations_A_fkey" FOREIGN KEY ("A") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketRemediations" ADD CONSTRAINT "_WorkOrderTicketRemediations_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketAdvisories" ADD CONSTRAINT "_WorkOrderTicketAdvisories_A_fkey" FOREIGN KEY ("A") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketAdvisories" ADD CONSTRAINT "_WorkOrderTicketAdvisories_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketDepartments" ADD CONSTRAINT "_WorkOrderTicketDepartments_A_fkey" FOREIGN KEY ("A") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkOrderTicketDepartments" ADD CONSTRAINT "_WorkOrderTicketDepartments_B_fkey" FOREIGN KEY ("B") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

