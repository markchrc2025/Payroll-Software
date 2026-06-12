-- ESS Phase 5: WebAuthn / passkey credentials for biometric ESS login.
-- Additive only — safe to run on a live database.

CREATE TABLE IF NOT EXISTS "EssWebAuthnCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    -- Base64url-encoded credential ID returned by the authenticator.
    "credentialId" TEXT NOT NULL,

    -- CBOR-encoded COSE public key (base64url).
    "publicKey" TEXT NOT NULL,

    -- Signature counter — increment enforced on every assertion.
    "counter" BIGINT NOT NULL DEFAULT 0,

    -- Device model identifier (UUID string).
    "aaguid" TEXT,

    -- Human-readable label set by the employee.
    "label" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "EssWebAuthnCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EssWebAuthnCredential_credentialId_key"
    ON "EssWebAuthnCredential" ("credentialId");

CREATE INDEX IF NOT EXISTS "EssWebAuthnCredential_tenantId_employeeId_idx"
    ON "EssWebAuthnCredential" ("tenantId", "employeeId");

DO $$ BEGIN
    ALTER TABLE "EssWebAuthnCredential"
        ADD CONSTRAINT "EssWebAuthnCredential_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "EssWebAuthnCredential"
        ADD CONSTRAINT "EssWebAuthnCredential_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EssWebAuthnCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EssWebAuthnCredential" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "tenant_isolation" ON "EssWebAuthnCredential"
        USING ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
