-- AlterTable
ALTER TABLE "product" ADD COLUMN     "deviceTypeId" TEXT;

-- CreateTable
CREATE TABLE "device_type" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "nameMappings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_type_slug_key" ON "device_type"("slug");

-- CreateIndex
CREATE INDEX "product_deviceTypeId_idx" ON "product"("deviceTypeId");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "device_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
