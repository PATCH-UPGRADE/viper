-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "hospitalImpact" TEXT,
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'Unsorted',
ADD COLUMN     "priorityReasonWhy" TEXT;
