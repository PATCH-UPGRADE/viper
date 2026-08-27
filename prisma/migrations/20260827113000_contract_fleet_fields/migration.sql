-- AlterTable
ALTER TABLE "contract" DROP COLUMN "coverageSummary",
ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "termsJson" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "contract_contractNumber_key" ON "contract"("contractNumber");

