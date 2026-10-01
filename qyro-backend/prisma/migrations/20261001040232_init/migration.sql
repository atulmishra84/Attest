-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AUDITOR', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "ControlState" AS ENUM ('EFFECTIVE', 'INEFFECTIVE', 'VIOLATED', 'BLOCKED_VIOLATION', 'UNKNOWN', 'NOT_TESTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AUDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'INTEGRATION',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discoverySource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intentDesc" TEXT,
    "requirementType" TEXT NOT NULL,

    CONSTRAINT "Control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlResult" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "state" "ControlState" NOT NULL,
    "evidencePayload" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeEvent" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "operation" TEXT,
    "resource" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "RuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ControlResult_agentId_idx" ON "ControlResult"("agentId");

-- CreateIndex
CREATE INDEX "ControlResult_state_idx" ON "ControlResult"("state");

-- CreateIndex
CREATE INDEX "RuntimeEvent_agentId_idx" ON "RuntimeEvent"("agentId");

-- CreateIndex
CREATE INDEX "RuntimeEvent_timestamp_idx" ON "RuntimeEvent"("timestamp");

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlResult" ADD CONSTRAINT "ControlResult_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlResult" ADD CONSTRAINT "ControlResult_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeEvent" ADD CONSTRAINT "RuntimeEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
