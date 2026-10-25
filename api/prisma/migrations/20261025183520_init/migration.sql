-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('RECEIVED', 'SCORED', 'EMAILED');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "company" TEXT,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'contact-form',
    "score" INTEGER,
    "scoreReason" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "scoredAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "webhookAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "latencyMs" INTEGER NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "day" DATE NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "scored" INTEGER NOT NULL DEFAULT 0,
    "emailed" INTEGER NOT NULL DEFAULT 0,
    "scoreSum" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "score_distribution" (
    "score" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "score_distribution_pkey" PRIMARY KEY ("score")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_externalId_key" ON "leads"("externalId");

-- CreateIndex
CREATE INDEX "leads_receivedAt_idx" ON "leads"("receivedAt");

-- CreateIndex
CREATE INDEX "processed_events_consumedAt_idx" ON "processed_events"("consumedAt");
