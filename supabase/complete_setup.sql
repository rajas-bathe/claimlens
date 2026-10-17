-- ====================================================================
-- ClaimLane Master Setup Script
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New Query
-- ====================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Custom Types & Enums
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('employee', 'finance');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE policy_status AS ENUM ('draft', 'proposed', 'active', 'superseded', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM (
    'uploading', 'extracting', 'extracted', 'extraction_failed', 'manual_entry'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM (
    'draft', 'submitted', 'needs_information', 'needs_review',
    'ready_for_approval', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_event_type AS ENUM (
    'submitted', 'extraction_complete', 'extraction_failed',
    'employee_correction', 'evaluation_complete',
    'information_requested', 'information_provided',
    'approved', 'rejected', 'reopened',
    'duplicate_flagged', 'policy_override',
    'batch_imported', 'status_changed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Core Tables
CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS expenses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id             UUID NOT NULL REFERENCES auth.users(id),
  processing_status       processing_status NOT NULL DEFAULT 'uploading',
  review_status           review_status NOT NULL DEFAULT 'draft',
  receipt_storage_path    TEXT,
  receipt_file_hash       TEXT,
  receipt_mime_type       TEXT,
  receipt_file_size       BIGINT,
  extraction_raw          JSONB,
  extraction_at           TIMESTAMPTZ,
  extraction_model        TEXT,
  extraction_error        TEXT,
  confirmed_fields        JSONB NOT NULL DEFAULT '{}',
  merchant                TEXT,
  expense_date            DATE,
  original_amount         NUMERIC(18,4),
  original_currency       CHAR(3),
  converted_amount        NUMERIC(18,4),
  converted_currency      CHAR(3) DEFAULT 'USD',
  exchange_rate           NUMERIC(18,8),
  exchange_rate_date      DATE,
  exchange_rate_source    TEXT,
  category                TEXT,
  city                    TEXT,
  trip_context            TEXT CHECK (trip_context IN ('business_trip', 'office', 'other')),
  business_purpose        TEXT,
  client_name             TEXT,
  attendee_count          INTEGER,
  attendee_names          TEXT[],
  policy_version_id       UUID REFERENCES policy_versions(id),
  batch_import_id         UUID REFERENCES batch_imports(id) ON DELETE SET NULL,
  version                 INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company       ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_employee      ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_review_status ON expenses(company_id, review_status);
CREATE INDEX IF NOT EXISTS idx_expenses_date          ON expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_hash          ON expenses(receipt_file_hash) WHERE receipt_file_hash IS NOT NULL;

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

-- 4. RLS Helper & Policies
CREATE OR REPLACE FUNCTION auth_is_finance(p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
      AND company_id = p_company_id
      AND role = 'finance'
  );
$$ LANGUAGE sql STABLE;

ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_imports    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select_member" ON companies;
CREATE POLICY "company_select_member" ON companies FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.user_id = auth.uid() AND memberships.company_id = companies.id)
);

DROP POLICY IF EXISTS "membership_select_own" ON memberships;
CREATE POLICY "membership_select_own" ON memberships FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "membership_select_finance" ON memberships;
CREATE POLICY "membership_select_finance" ON memberships FOR SELECT USING (auth_is_finance(company_id));

DROP POLICY IF EXISTS "policy_select_active_employee" ON policy_versions;
CREATE POLICY "policy_select_active_employee" ON policy_versions FOR SELECT USING (
  status = 'active' AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = auth.uid() AND m.company_id = policy_versions.company_id)
);

DROP POLICY IF EXISTS "policy_select_finance" ON policy_versions;
CREATE POLICY "policy_select_finance" ON policy_versions FOR SELECT USING (auth_is_finance(company_id));

DROP POLICY IF EXISTS "expense_select_own" ON expenses;
CREATE POLICY "expense_select_own" ON expenses FOR SELECT USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "expense_select_finance" ON expenses;
CREATE POLICY "expense_select_finance" ON expenses FOR SELECT USING (auth_is_finance(company_id));

DROP POLICY IF EXISTS "expense_insert_employee" ON expenses;
CREATE POLICY "expense_insert_employee" ON expenses FOR INSERT WITH CHECK (
  employee_id = auth.uid() AND EXISTS (SELECT 1 FROM memberships WHERE user_id = auth.uid() AND company_id = expenses.company_id)
);

DROP POLICY IF EXISTS "evaluation_select_own" ON evaluations;
CREATE POLICY "evaluation_select_own" ON evaluations FOR SELECT USING (
  EXISTS (SELECT 1 FROM expenses WHERE expenses.id = evaluations.expense_id AND expenses.employee_id = auth.uid())
);

DROP POLICY IF EXISTS "evaluation_select_finance" ON evaluations;
CREATE POLICY "evaluation_select_finance" ON evaluations FOR SELECT USING (
  EXISTS (SELECT 1 FROM expenses e JOIN memberships m ON m.company_id = e.company_id WHERE e.id = evaluations.expense_id AND m.user_id = auth.uid() AND m.role = 'finance')
);

DROP POLICY IF EXISTS "review_event_select_own" ON review_events;
CREATE POLICY "review_event_select_own" ON review_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM expenses WHERE expenses.id = review_events.expense_id AND expenses.employee_id = auth.uid())
);

DROP POLICY IF EXISTS "review_event_select_finance" ON review_events;
CREATE POLICY "review_event_select_finance" ON review_events FOR SELECT USING (auth_is_finance(company_id));

DROP POLICY IF EXISTS "batch_import_select_finance" ON batch_imports;
CREATE POLICY "batch_import_select_finance" ON batch_imports FOR SELECT USING (auth_is_finance(company_id));

-- 5. Private Storage Bucket for Receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf'];

DROP POLICY IF EXISTS "receipt_select_auth" ON storage.objects;
CREATE POLICY "receipt_select_auth" ON storage.objects FOR SELECT USING (
  bucket_id = 'receipts'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM memberships WHERE user_id = auth.uid()
    )
  )
);

-- 6. Initial Seed Data (Company & Active Policy)
INSERT INTO companies (id, name, slug, settings)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Acme Global Technologies',
  'acme-tech',
  '{"default_currency": "USD"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- Link finance & employee users if they exist in auth.users
INSERT INTO memberships (user_id, company_id, role, display_name, email)
SELECT u.id, 'a0000000-0000-0000-0000-000000000001'::uuid, 'finance'::membership_role, 'Elena Rostova (Finance Lead)', u.email
FROM auth.users u
WHERE u.email = 'finance@acme.com'
ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'finance', display_name = 'Elena Rostova (Finance Lead)';

INSERT INTO memberships (user_id, company_id, role, display_name, email)
SELECT u.id, 'a0000000-0000-0000-0000-000000000001'::uuid, 'employee'::membership_role, 'Alex Chen (Sales Director)', u.email
FROM auth.users u
WHERE u.email = 'alex.chen@acme.com'
ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'employee', display_name = 'Alex Chen (Sales Director)';

-- Active Policy Version 1
INSERT INTO policy_versions (
  company_id,
  version_number,
  status,
  source_document,
  structured_rules,
  unsupported_clauses,
  effective_from,
  confirmed_at
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  1,
  'active',
  'ACME GLOBAL CORP - TRAVEL & EXPENSE POLICY (REV 2026.1)

1. SUBMISSION INTEGRITY & DOCUMENTATION
1.1 Every expense submission must be accompanied by a legible receipt showing printed merchant name, transaction date, and total amount.
1.2 Itemized receipts are mandatory for all hotel accommodations and for any meal claim exceeding $50.00 USD. Summarized credit card slips without item breakdown are unacceptable for these expenses.
1.3 Printed receipt figures must match line-item arithmetic. Discrepancies between printed totals and line item sums must be explained prior to reimbursement approval.

2. MEAL & SUBSISTENCE ALLOWANCES
2.1 Routine Local / Office Meals: Reimbursable up to a maximum daily cap of $25.00 USD per employee.
2.2 Business Travel Meals: For employees traveling on approved business trips outside their home office radius, the daily meal limit is $75.00 USD.
2.3 Tier 1 High-Cost Cities (New York, San Francisco, London, Zurich, Tokyo): The daily travel meal limit is elevated to $100.00 USD.
2.4 Cumulative Daily Cap: Multiple meal receipts submitted on the same calendar day accumulate toward the applicable daily cap. Spending exceeding the cap is non-reimbursable.

3. CLIENT ENTERTAINMENT & DINING
3.1 Client entertainment expenses require explicit entry of the verified Client/Company Name and the Total Number of Attendees.
3.2 Client meals are capped at $100.00 USD per attendee.
3.3 Executive Approval Threshold: Any single client entertainment expense exceeding $500.00 USD requires formal Senior Executive review before approval.

4. LODGING & AIR TRAVEL
4.1 Hotel lodging is capped at $250.00 USD per night standard, or $350.00 USD per night in Tier 1 high-cost cities.
4.2 Discretionary: Employees should choose standard rooms and avoid luxury boutique hotels whenever reasonably practical.

5. NON-REIMBURSABLE / PROHIBITED ITEMS
5.1 Personal purchases, tobacco, gambling, lottery tickets, hotel minibar consumables, and personal in-room movies are strictly prohibited and non-reimbursable.
5.2 Alcoholic beverages are only permissible during authorized client entertainment dinners, subject to a maximum of $30.00 USD per attendee.

6. CURRENCY CONVERSION & PAYMENTS
6.1 Claims incurred in foreign currencies must cite recognizable ISO currency codes. Transactions with ambiguous currency markers cannot be automatically reimbursed.',
  '[
    {
      "id": "rule_meal_office_daily_cap",
      "type": "daily_cap",
      "source_clause": "Clause 2.1",
      "supporting_text": "Routine Local / Office Meals: Reimbursable up to a maximum daily cap of $25.00 USD per employee.",
      "conditions": [{"field": "trip_context", "operator": "eq", "value": "office"}],
      "limit": 25.0,
      "limit_currency": "USD",
      "aggregation_scope": "daily",
      "outcome": "block",
      "categories": ["Business meals"],
      "trip_contexts": ["office"]
    },
    {
      "id": "rule_meal_travel_daily_cap",
      "type": "daily_cap",
      "source_clause": "Clause 2.2 & 2.3",
      "supporting_text": "Business Travel Meals: daily limit is $75.00 USD standard, or $100.00 USD in Tier 1 High-Cost Cities.",
      "conditions": [{"field": "trip_context", "operator": "eq", "value": "business_trip"}],
      "limit": 75.0,
      "limit_currency": "USD",
      "aggregation_scope": "daily",
      "outcome": "block",
      "categories": ["Business meals"],
      "cities": ["New York", "San Francisco", "London", "Zurich", "Tokyo"],
      "trip_contexts": ["business_trip"]
    },
    {
      "id": "rule_client_entertainment_attendee_cap",
      "type": "per_expense_cap",
      "source_clause": "Clause 3.2",
      "supporting_text": "Client meals are capped at $100.00 USD per attendee.",
      "conditions": [],
      "limit": 100.0,
      "limit_currency": "USD",
      "aggregation_scope": "per_expense",
      "required_field": "client_name",
      "outcome": "block",
      "categories": ["Client entertainment"]
    },
    {
      "id": "rule_client_entertainment_exec_threshold",
      "type": "approval_threshold",
      "source_clause": "Clause 3.3",
      "supporting_text": "Any single client entertainment expense exceeding $500.00 USD requires formal Senior Executive review before approval.",
      "conditions": [],
      "limit": 500.0,
      "limit_currency": "USD",
      "aggregation_scope": "per_expense",
      "outcome": "require_approval",
      "categories": ["Client entertainment"]
    },
    {
      "id": "rule_prohibited_items",
      "type": "prohibited_item",
      "source_clause": "Clause 5.1",
      "supporting_text": "Personal purchases, tobacco, gambling, lottery tickets, hotel minibar consumables are strictly prohibited.",
      "conditions": [],
      "prohibited_values": ["tobacco", "gambling", "minibar", "cigarette", "cigar", "lottery"],
      "outcome": "block"
    }
  ]'::jsonb,
  '[
    {
      "clause_id": "Clause 4.2",
      "source_text": "Employees should choose standard rooms and avoid luxury boutique hotels whenever reasonably practical.",
      "reason": "Discretionary recommendation without a computable pricing limit or measurable threshold."
    }
  ]'::jsonb,
  '2026-01-01',
  NOW()
)
ON CONFLICT (company_id, version_number) DO UPDATE SET
  structured_rules = EXCLUDED.structured_rules,
  status = 'active';
