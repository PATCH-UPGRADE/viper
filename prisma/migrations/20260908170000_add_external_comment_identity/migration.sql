-- CreateTable
CREATE TABLE "external_comment_identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remediationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "pseudonym" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_comment_identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_comment_identity_remediationId_idx" ON "external_comment_identity"("remediationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_comment_identity_userId_remediationId_integrationI_key" ON "external_comment_identity"("userId", "remediationId", "integrationId");

-- AddForeignKey
ALTER TABLE "external_comment_identity" ADD CONSTRAINT "external_comment_identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_comment_identity" ADD CONSTRAINT "external_comment_identity_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_comment_identity" ADD CONSTRAINT "external_comment_identity_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

