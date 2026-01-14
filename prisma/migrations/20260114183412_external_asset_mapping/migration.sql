-- CreateTable
CREATE TABLE "external_asset_mappings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_asset_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_asset_mappings_assetId_idx" ON "external_asset_mappings"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "external_asset_mappings_assetId_integrationId_key" ON "external_asset_mappings"("assetId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_asset_mappings_integrationId_externalId_key" ON "external_asset_mappings"("integrationId", "externalId");

-- AddForeignKey
ALTER TABLE "external_asset_mappings" ADD CONSTRAINT "external_asset_mappings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_asset_mappings" ADD CONSTRAINT "external_asset_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
