-- CreateTable
CREATE TABLE "plan_briefing" (
    "id" TEXT NOT NULL,
    "mitigationPlanId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_briefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_briefing_mitigationPlanId_key" ON "plan_briefing"("mitigationPlanId");

-- AddForeignKey
ALTER TABLE "plan_briefing" ADD CONSTRAINT "plan_briefing_mitigationPlanId_fkey" FOREIGN KEY ("mitigationPlanId") REFERENCES "mitigation_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
