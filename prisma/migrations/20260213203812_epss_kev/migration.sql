-- DropIndex
DROP INDEX "public"."vulnerability_cveId_key";

-- AlterTable
ALTER TABLE "vulnerability" ADD COLUMN     "epss" DOUBLE PRECISION,
ADD COLUMN     "inKEV" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedEpss" TIMESTAMP(3),
ADD COLUMN     "updatedInKev" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "vulnerability_epss_idx" ON "vulnerability"("epss");

-- CreateIndex
CREATE INDEX "vulnerability_inKEV_idx" ON "vulnerability"("inKEV");
