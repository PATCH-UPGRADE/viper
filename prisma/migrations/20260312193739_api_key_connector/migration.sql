-- CreateTable
CREATE TABLE "api_key_connector" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "resourceType" "ResourceType",
    "lastRequest" TIMESTAMP(3),
    "apiKeyId" TEXT,
    "integrationId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_connector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_connector_apiKeyId_key" ON "api_key_connector"("apiKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_connector_integrationId_key" ON "api_key_connector"("integrationId");

-- CreateIndex
CREATE INDEX "api_key_connector_userId_idx" ON "api_key_connector"("userId");

-- AddForeignKey
ALTER TABLE "api_key_connector" ADD CONSTRAINT "api_key_connector_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "apikey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_connector" ADD CONSTRAINT "api_key_connector_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_connector" ADD CONSTRAINT "api_key_connector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
