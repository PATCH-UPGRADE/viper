-- CreateEnum
CREATE TYPE "MatchFeedbackTargetType" AS ENUM ('NotificationDeviceGroupMapping', 'NotificationAssetMapping', 'NotificationRemediationMapping', 'NotificationVulnerabilityMapping');

-- CreateEnum
CREATE TYPE "MatchFeedbackCategory" AS ENUM ('Incorrect', 'Correct');

-- AlterEnum
ALTER TYPE "ConfidenceLevel" ADD VALUE 'Rejected';

-- CreateTable
CREATE TABLE "match_feedback" (
    "id" TEXT NOT NULL,
    "targetType" "MatchFeedbackTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" "MatchFeedbackCategory" NOT NULL,
    "comment" TEXT,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_feedback_targetType_targetId_idx" ON "match_feedback"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "match_feedback_notificationId_idx" ON "match_feedback"("notificationId");

-- AddForeignKey
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
