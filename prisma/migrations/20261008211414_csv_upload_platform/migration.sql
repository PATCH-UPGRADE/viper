-- CreateEnum
CREATE TYPE "CsvImportStatus" AS ENUM ('Staging', 'Queued', 'Running', 'Succeeded', 'PartiallyFailed', 'Failed');

-- AlterEnum
ALTER TYPE "PlatformEnum" ADD VALUE 'CSV_UPLOAD';

-- CreateTable
CREATE TABLE "csv_import" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "headers" TEXT[],
    "plan" JSONB NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CsvImportStatus" NOT NULL DEFAULT 'Staging',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "linkedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "csv_import_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "csv_import_userId_status_idx" ON "csv_import"("userId", "status");

-- CreateIndex
CREATE INDEX "csv_import_integrationId_idx" ON "csv_import"("integrationId");

-- CreateIndex
CREATE INDEX "asset_serialNumber_idx" ON "asset"("serialNumber");

-- CreateIndex
CREATE INDEX "asset_macAddress_idx" ON "asset"("macAddress");

-- CreateIndex
CREATE INDEX "asset_hostname_idx" ON "asset"("hostname");

-- AddForeignKey
ALTER TABLE "csv_import" ADD CONSTRAINT "csv_import_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_import" ADD CONSTRAINT "csv_import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
