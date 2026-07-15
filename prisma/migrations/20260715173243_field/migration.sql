-- CreateEnum
CREATE TYPE "CorrectionTargetType" AS ENUM ('Notification');

-- CreateTable
CREATE TABLE "field_correction" (
    "id" TEXT NOT NULL,
    "targetType" "CorrectionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" JSONB,
    "toValue" JSONB,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_correction_targetType_targetId_idx" ON "field_correction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "field_correction_userId_idx" ON "field_correction"("userId");

-- CreateIndex
CREATE INDEX "field_correction_field_createdAt_idx" ON "field_correction"("field", "createdAt");

-- AddForeignKey
ALTER TABLE "field_correction" ADD CONSTRAINT "field_correction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
