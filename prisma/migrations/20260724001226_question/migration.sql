-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'DISMISSED', 'UNSURE');

-- CreateTable
CREATE TABLE "question" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reasonWhy" TEXT NOT NULL,
    "suggestedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "answer" TEXT,
    "answeredByUserId" TEXT,
    "answeredAt" TIMESTAMP(3),
    "resultingNoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_resultingNoteId_key" ON "question"("resultingNoteId");

-- CreateIndex
CREATE INDEX "question_issueId_idx" ON "question"("issueId");

-- CreateIndex
CREATE INDEX "question_notificationId_idx" ON "question"("notificationId");

-- CreateIndex
CREATE INDEX "question_status_idx" ON "question"("status");

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_resultingNoteId_fkey" FOREIGN KEY ("resultingNoteId") REFERENCES "note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
