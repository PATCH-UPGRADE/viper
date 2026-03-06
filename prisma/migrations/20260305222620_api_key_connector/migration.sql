-- CreateTable
CREATE TABLE "api_key_connector" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "resourceType" "ResourceType",
    "lastRequest" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKeyId" TEXT,
    "integrationId" TEXT,

    CONSTRAINT "api_key_connector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_connector_apiKeyId_key" ON "api_key_connector"("apiKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_connector_integrationId_key" ON "api_key_connector"("integrationId");

-- CreateIndex
CREATE INDEX "api_key_connector_apiKeyId_idx" ON "api_key_connector"("apiKeyId");

-- CreateIndex
CREATE INDEX "api_key_connector_integrationId_idx" ON "api_key_connector"("integrationId");

-- AddForeignKey
ALTER TABLE "api_key_connector" ADD CONSTRAINT "api_key_connector_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "apikey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_connector" ADD CONSTRAINT "api_key_connector_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
