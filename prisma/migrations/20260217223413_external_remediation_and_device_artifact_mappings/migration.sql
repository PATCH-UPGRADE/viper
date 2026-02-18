-- CreateTable
CREATE TABLE "external_device_artifact_mappings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSynced" TIMESTAMP(3),

    CONSTRAINT "external_device_artifact_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_remediation_mappings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSynced" TIMESTAMP(3),

    CONSTRAINT "external_remediation_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_device_artifact_mappings_itemId_idx" ON "external_device_artifact_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_device_artifact_mappings_itemId_integrationId_key" ON "external_device_artifact_mappings"("itemId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_device_artifact_mappings_integrationId_externalId_key" ON "external_device_artifact_mappings"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "external_remediation_mappings_itemId_idx" ON "external_remediation_mappings"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "external_remediation_mappings_itemId_integrationId_key" ON "external_remediation_mappings"("itemId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_remediation_mappings_integrationId_externalId_key" ON "external_remediation_mappings"("integrationId", "externalId");

-- AddForeignKey
ALTER TABLE "external_device_artifact_mappings" ADD CONSTRAINT "external_device_artifact_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "device_artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_device_artifact_mappings" ADD CONSTRAINT "external_device_artifact_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_remediation_mappings" ADD CONSTRAINT "external_remediation_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_remediation_mappings" ADD CONSTRAINT "external_remediation_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
