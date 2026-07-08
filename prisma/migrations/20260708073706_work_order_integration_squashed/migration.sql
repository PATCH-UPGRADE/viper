-- AlterEnum
ALTER TYPE "ResourceType" ADD VALUE 'WorkOrder';

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'REST';

-- AlterEnum
ALTER TYPE "TicketCategory" ADD VALUE 'MAINTENANCE';

-- CreateTable
CREATE TABLE "external_work_order_mappings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSynced" TIMESTAMP(3),

    CONSTRAINT "external_work_order_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_work_order_mappings_itemId_idx" ON "external_work_order_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_work_order_mappings_itemId_integrationId_key" ON "external_work_order_mappings"("itemId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_work_order_mappings_integrationId_externalId_key" ON "external_work_order_mappings"("integrationId", "externalId");

-- AddForeignKey
ALTER TABLE "external_work_order_mappings" ADD CONSTRAINT "external_work_order_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_work_order_mappings" ADD CONSTRAINT "external_work_order_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
