-- CreateEnum
CREATE TYPE "QuestionAudience" AS ENUM ('VENDOR', 'MANUFACTURER');

-- AlterTable
ALTER TABLE "question" ADD COLUMN     "audience" "QuestionAudience";
