-- CreateEnum
CREATE TYPE "DebriefStatus" AS ENUM ('Generating', 'Ready', 'Failed');

-- CreateTable
CREATE TABLE "debrief" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "status" "DebriefStatus" NOT NULL DEFAULT 'Generating',
    "bullets" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "since" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debrief_departmentId_createdAt_idx" ON "debrief"("departmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "debrief" ADD CONSTRAINT "debrief_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
