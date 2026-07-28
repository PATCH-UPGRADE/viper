/*
  Warnings:

  - A unique constraint covering the columns `[parentQuestionId]` on the table `question` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "question" ADD COLUMN     "parentQuestionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "question_parentQuestionId_key" ON "question"("parentQuestionId");

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
