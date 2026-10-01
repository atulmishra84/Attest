-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "owner" TEXT;

-- CreateTable
CREATE TABLE "ActionDecision" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "operation" TEXT,
    "resource" TEXT,
    "tool" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "controls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionDecision_agentId_createdAt_idx" ON "ActionDecision"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionDecision_createdAt_idx" ON "ActionDecision"("createdAt");

-- AddForeignKey
ALTER TABLE "ActionDecision" ADD CONSTRAINT "ActionDecision_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
