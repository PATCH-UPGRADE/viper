-- AlterTable
ALTER TABLE "external_source_record_mappings" ADD COLUMN     "itemId" TEXT;

-- CreateIndex
CREATE INDEX "external_source_record_mappings_itemId_idx" ON "external_source_record_mappings"("itemId");

-- AddForeignKey
ALTER TABLE "external_source_record_mappings" ADD CONSTRAINT "external_source_record_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "source_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
