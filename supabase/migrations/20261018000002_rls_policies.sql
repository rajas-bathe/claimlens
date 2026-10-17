-- ============================================================
-- ClaimLane Migration 002 – Row Level Security Policies
-- ============================================================

-- Helper functions for RLS
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

-- Enable RLS
ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_imports    ENABLE ROW LEVEL SECURITY;

-- 1. COMPANIES: Members can view their company
CREATE POLICY "company_select_member"
  ON companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
        AND memberships.company_id = companies.id
    )
  );

-- 2. MEMBERSHIPS: Members see own; Finance sees all in company
CREATE POLICY "membership_select_own"
  ON memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "membership_select_finance"
  ON memberships FOR SELECT
  USING (auth_is_finance(company_id));

-- 3. POLICY VERSIONS: Active visible to employees; all visible to finance
CREATE POLICY "policy_select_active_employee"
  ON policy_versions FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.company_id = policy_versions.company_id
    )
  );

CREATE POLICY "policy_select_finance"
  ON policy_versions FOR SELECT
  USING (auth_is_finance(company_id));

-- 4. EXPENSES: Employees see and insert own; Finance sees company
CREATE POLICY "expense_select_own"
  ON expenses FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "expense_select_finance"
  ON expenses FOR SELECT
  USING (auth_is_finance(company_id));

CREATE POLICY "expense_insert_employee"
  ON expenses FOR INSERT
  WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
        AND company_id = expenses.company_id
    )
  );

-- 5. EVALUATIONS: Inherits access from parent expense
CREATE POLICY "evaluation_select_own"
  ON evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = evaluations.expense_id
        AND expenses.employee_id = auth.uid()
    )
  );

CREATE POLICY "evaluation_select_finance"
  ON evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN memberships m ON m.company_id = e.company_id
      WHERE e.id = evaluations.expense_id
        AND m.user_id = auth.uid()
        AND m.role = 'finance'
    )
  );

-- 6. REVIEW EVENTS: Inherits access from parent expense
CREATE POLICY "review_event_select_own"
  ON review_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = review_events.expense_id
        AND expenses.employee_id = auth.uid()
    )
  );

CREATE POLICY "review_event_select_finance"
  ON review_events FOR SELECT
  USING (auth_is_finance(company_id));

-- 7. BATCH IMPORTS: Finance only
CREATE POLICY "batch_import_select_finance"
  ON batch_imports FOR SELECT
  USING (auth_is_finance(company_id));
