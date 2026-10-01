-- CreateTable
CREATE TABLE "ThreatFinding" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "eventId" INTEGER,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreatFinding_createdAt_idx" ON "ThreatFinding"("createdAt");

-- CreateIndex
CREATE INDEX "ThreatFinding_agentId_idx" ON "ThreatFinding"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ThreatFinding_eventId_kind_key" ON "ThreatFinding"("eventId", "kind");

-- AddForeignKey
ALTER TABLE "ThreatFinding" ADD CONSTRAINT "ThreatFinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
