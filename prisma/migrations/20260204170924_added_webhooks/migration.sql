-- CreateEnum
CREATE TYPE "TriggerEnum" AS ENUM ('DeviceGroup_Created', 'DeviceGroup_Updated', 'Artifact_Created', 'Artifact_Updated');

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggers" "TriggerEnum"[],
    "callbackUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" "AuthType" NOT NULL,
    "authentication" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Webhook_userId_idx" ON "Webhook"("userId");

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
