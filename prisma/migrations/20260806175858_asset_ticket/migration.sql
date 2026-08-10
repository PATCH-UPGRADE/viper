-- DropForeignKey
ALTER TABLE "_WorkOrderTicketAssets" DROP CONSTRAINT "_WorkOrderTicketAssets_A_fkey";

-- DropForeignKey
ALTER TABLE "_WorkOrderTicketAssets" DROP CONSTRAINT "_WorkOrderTicketAssets_B_fkey";

-- DropTable
DROP TABLE "_WorkOrderTicketAssets";

-- CreateTable
CREATE TABLE "asset_ticket" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "parentTicketId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_ticket_ticketId_key" ON "asset_ticket"("ticketId");

-- CreateIndex
CREATE INDEX "asset_ticket_assetId_idx" ON "asset_ticket"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_ticket_parentTicketId_assetId_key" ON "asset_ticket"("parentTicketId", "assetId");

-- AddForeignKey
ALTER TABLE "asset_ticket" ADD CONSTRAINT "asset_ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_ticket" ADD CONSTRAINT "asset_ticket_parentTicketId_fkey" FOREIGN KEY ("parentTicketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_ticket" ADD CONSTRAINT "asset_ticket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
