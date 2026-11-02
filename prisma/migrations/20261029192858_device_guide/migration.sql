-- CreateEnum
CREATE TYPE "DeviceGuideTopic" AS ENUM ('TYPICAL_USAGE');

-- CreateTable
CREATE TABLE "device_guide" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT,
    "productId" TEXT,
    "topic" "DeviceGuideTopic" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_guide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_guide_deviceTypeId_topic_key" ON "device_guide"("deviceTypeId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "device_guide_productId_topic_key" ON "device_guide"("productId", "topic");

-- AddForeignKey
ALTER TABLE "device_guide" ADD CONSTRAINT "device_guide_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "device_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_guide" ADD CONSTRAINT "device_guide_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
