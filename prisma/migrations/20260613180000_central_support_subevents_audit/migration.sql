-- Central Portal PR2: support tickets, subscription-event history, platform audit feed.

DO $$ BEGIN CREATE TYPE "TicketPriority" AS ENUM ('URGENT','HIGH','NORMAL','LOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TicketStatus" AS ENUM ('OPEN','PENDING','RESOLVED','CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SubscriptionEventType" AS ENUM ('TRIAL_STARTED','SUBSCRIBED','UPGRADED','DOWNGRADED','RENEWED','PAYMENT_FAILED','CANCELLED','REACTIVATED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CentralAuditKind" AS ENUM ('SECURITY','BILLING','TENANT','SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"           TEXT PRIMARY KEY,
  "ticketNumber" TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "subject"      TEXT NOT NULL,
  "body"         TEXT,
  "priority"     "TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status"       "TicketStatus"   NOT NULL DEFAULT 'OPEN',
  "agentUserId"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "resolvedAt"   TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx"      ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_idx"    ON "SupportTicket"("tenantId");
CREATE INDEX IF NOT EXISTS "SupportTicket_agentUserId_idx" ON "SupportTicket"("agentUserId");

CREATE TABLE IF NOT EXISTS "SubscriptionEvent" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "type"        "SubscriptionEventType" NOT NULL,
  "detail"      TEXT,
  "actorUserId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_tenantId_createdAt_idx" ON "SubscriptionEvent"("tenantId","createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_type_idx"               ON "SubscriptionEvent"("type");

CREATE TABLE IF NOT EXISTS "CentralAuditEvent" (
  "id"          TEXT PRIMARY KEY,
  "actorUserId" TEXT,
  "actorName"   TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "target"      TEXT NOT NULL,
  "kind"        "CentralAuditKind" NOT NULL DEFAULT 'SYSTEM',
  "tenantId"    TEXT,
  "ipAddress"   TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CentralAuditEvent_createdAt_idx"          ON "CentralAuditEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "CentralAuditEvent_kind_idx"               ON "CentralAuditEvent"("kind");
CREATE INDEX IF NOT EXISTS "CentralAuditEvent_tenantId_createdAt_idx" ON "CentralAuditEvent"("tenantId","createdAt");

ALTER TABLE "SupportTicket"     ADD CONSTRAINT "SupportTicket_tenantId_fkey"     FOREIGN KEY ("tenantId")    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"     ADD CONSTRAINT "SupportTicket_agentUserId_fkey"  FOREIGN KEY ("agentUserId") REFERENCES "User"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_tenantId_fkey" FOREIGN KEY ("tenantId")    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentralAuditEvent" ADD CONSTRAINT "CentralAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentralAuditEvent" ADD CONSTRAINT "CentralAuditEvent_tenantId_fkey"    FOREIGN KEY ("tenantId")    REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
