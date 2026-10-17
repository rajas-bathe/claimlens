-- ============================================================
-- ClaimLane Migration 001 – Core Database Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMBERSHIPS (links auth.users -> companies with role)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('employee', 'finance');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role          membership_role NOT NULL DEFAULT 'employee',
  display_name  TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user    ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_company ON memberships(company_id);

-- ============================================================
-- POLICY VERSIONS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE policy_status AS ENUM ('draft', 'proposed', 'active', 'superseded', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS policy_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version_number      INTEGER NOT NULL,
  status              policy_status NOT NULL DEFAULT 'draft',
  source_document     TEXT,
  source_file_path    TEXT,
  structured_rules    JSONB,
  unsupported_clauses JSONB DEFAULT '[]',
  confirmed_by        UUID REFERENCES auth.users(id),
  confirmed_at        TIMESTAMPTZ,
  effective_from      DATE,
  effective_to        DATE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_company ON policy_versions(company_id, status);

-- ============================================================
-- BATCH IMPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  total_files     INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  failed_files    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM (
    'uploading', 'extracting', 'extracted', 'extraction_failed', 'manual_entry'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM (
    'draft', 'submitted', 'needs_information', 'needs_review',
    'ready_for_approval', 'approved', 'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id             UUID NOT NULL REFERENCES auth.users(id),
  
  -- Processing state
  processing_status       processing_status NOT NULL DEFAULT 'uploading',
  review_status           review_status NOT NULL DEFAULT 'draft',
  
  -- Receipt storage
  receipt_storage_path    TEXT,
  receipt_file_hash       TEXT,
  receipt_mime_type       TEXT,
  receipt_file_size       BIGINT,
  
  -- Original extraction
  extraction_raw          JSONB,
  extraction_at           TIMESTAMPTZ,
  extraction_model        TEXT,
  extraction_error        TEXT,
  
  -- Confirmed fields with provenance
  confirmed_fields        JSONB NOT NULL DEFAULT '{}',
  
  -- Denormalized core fields
  merchant                TEXT,
  expense_date            DATE,
  original_amount         NUMERIC(18,4),
  original_currency       CHAR(3),
  converted_amount        NUMERIC(18,4),
  converted_currency      CHAR(3) DEFAULT 'USD',
  exchange_rate           NUMERIC(18,8),
  exchange_rate_date      DATE,
  exchange_rate_source    TEXT,
  
  -- Category and context
  category                TEXT,
  city                    TEXT,
  trip_context            TEXT CHECK (trip_context IN ('business_trip', 'office', 'other')),
  business_purpose        TEXT,
  client_name             TEXT,
  attendee_count          INTEGER,
  attendee_names          TEXT[],
  
  -- Policy reference
  policy_version_id       UUID REFERENCES policy_versions(id),
  batch_import_id         UUID REFERENCES batch_imports(id) ON DELETE SET NULL,
  
  -- Concurrency
  version                 INTEGER NOT NULL DEFAULT 1,
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company       ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_employee      ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_review_status ON expenses(company_id, review_status);
CREATE INDEX IF NOT EXISTS idx_expenses_date          ON expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_hash          ON expenses(receipt_file_hash) WHERE receipt_file_hash IS NOT NULL;

-- ============================================================
-- EVALUATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id          UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  policy_version_id   UUID REFERENCES policy_versions(id),
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluator_version   TEXT NOT NULL,
  inputs_snapshot     JSONB NOT NULL,
  rule_results        JSONB NOT NULL,
  overall_outcome     TEXT NOT NULL,
  reimbursable_amount NUMERIC(18,4),
  reimbursable_currency CHAR(3),
  duplicate_findings  JSONB DEFAULT '[]',
  spending_context    JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_expense ON evaluations(expense_id, evaluated_at DESC);

-- ============================================================
-- REVIEW EVENTS (Audit History)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE review_event_type AS ENUM (
    'submitted', 'extraction_complete', 'extraction_failed',
    'employee_correction', 'evaluation_complete',
    'information_requested', 'information_provided',
    'approved', 'rejected', 'reopened',
    'duplicate_flagged', 'policy_override',
    'batch_imported', 'status_changed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS review_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id),
  actor_id      UUID REFERENCES auth.users(id),
  actor_role    membership_role,
  event_type    review_event_type NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_events_expense ON review_events(expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_events_company ON review_events(company_id, created_at DESC);
