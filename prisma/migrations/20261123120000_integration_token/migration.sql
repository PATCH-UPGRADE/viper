-- Tokens expire after 15 minutes, so the existing ones are not carried over.
-- DropForeignKey
ALTER TABLE "UserToken" DROP CONSTRAINT "UserToken_userId_fkey";

-- DropTable
DROP TABLE "UserToken";

-- CreateTable
CREATE TABLE "integration_token" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "resource" "ResourceType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_token_tokenHash_key" ON "integration_token"("tokenHash");

-- CreateIndex
CREATE INDEX "integration_token_integrationId_idx" ON "integration_token"("integrationId");

-- CreateIndex
CREATE INDEX "integration_token_expiresAt_idx" ON "integration_token"("expiresAt");

-- AddForeignKey
ALTER TABLE "integration_token" ADD CONSTRAINT "integration_token_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
