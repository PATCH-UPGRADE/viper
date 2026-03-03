-- CreateTable
CREATE TABLE "api_key_resource_type" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "resourceType" "ResourceType",
    "lastRequest" TIMESTAMP(3),
    "apiKeyId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_resource_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_resource_type_apiKeyId_key" ON "api_key_resource_type"("apiKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_resource_type_integrationId_key" ON "api_key_resource_type"("integrationId");

-- AddForeignKey
ALTER TABLE "api_key_resource_type" ADD CONSTRAINT "api_key_resource_type_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "apikey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_resource_type" ADD CONSTRAINT "api_key_resource_type_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
