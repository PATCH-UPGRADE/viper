-- AlterTable
ALTER TABLE "artifact_wrapper" ADD COLUMN     "contractId" TEXT;

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalDisplayName" TEXT NOT NULL,
    "overview" TEXT,
    "partnerSince" TIMESTAMP(3),
    "manufacturerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "coverageSummary" TEXT,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_asset" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_canonicalName_key" ON "vendor"("canonicalName");

-- CreateIndex
CREATE INDEX "vendor_canonicalName_idx" ON "vendor"("canonicalName");

-- CreateIndex
CREATE INDEX "vendor_manufacturerId_idx" ON "vendor"("manufacturerId");

-- CreateIndex
CREATE INDEX "vendor_contact_vendorId_idx" ON "vendor_contact"("vendorId");

-- CreateIndex
CREATE INDEX "contract_vendorId_idx" ON "contract"("vendorId");

-- CreateIndex
CREATE INDEX "contract_asset_contractId_idx" ON "contract_asset"("contractId");

-- CreateIndex
CREATE INDEX "contract_asset_assetId_idx" ON "contract_asset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_asset_contractId_assetId_key" ON "contract_asset"("contractId", "assetId");

-- CreateIndex
CREATE INDEX "artifact_wrapper_contractId_idx" ON "artifact_wrapper"("contractId");

-- AddForeignKey
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contact" ADD CONSTRAINT "vendor_contact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_asset" ADD CONSTRAINT "contract_asset_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_asset" ADD CONSTRAINT "contract_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_wrapper" ADD CONSTRAINT "artifact_wrapper_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

