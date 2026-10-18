# ClaimLens — Expense Review Web Application

ClaimLens is an intelligent expense review and compliance platform designed for modern finance teams and employees. It captures receipt documents, extracts structured data with Gemini AI, validates claim context against company policy rules with a deterministic policy engine, and surfaces exceptions for human review.

---

## 🚀 Key Features

- **Dashboard Reports:** Generate a date/status-filtered report, preview currency-separated totals, download CSV, or use the dedicated Print / PDF layout. Employees see their own claims; finance sees company claims. See [report behavior and verification](DESIGN_AND_REPORTS.md).

- **Document Capture & Extraction:** Upload image (JPEG, PNG, WebP) or PDF receipts. Receipt preview with rotation, zoom, and direct upload to private Supabase Storage.
- **AI Extraction Pipeline:** Gemini structured extraction with strict schema validation. Reads printed merchant, dates, currency, line items, taxes, and detects arithmetic discrepancies between line items and totals without inventing missing data.
- **Deterministic Policy Engine:** Pure, independently testable TypeScript functions with exact decimal math (`decimal.js`). Evaluates daily caps, category caps, city tier overrides (e.g. NYC/London/Tokyo), client entertainment requirements, prohibited items, itemization completeness, and approval thresholds.
- **Duplicate & Pattern Detection:** Dual-layer detection combining exact SHA-256 binary file hash matching and probable duplicate matching (merchant, date, and amount across employees).
- **Cumulative Spending:** Dynamically aggregates daily and category expenditures across historical receipts, ensuring late-arriving receipts or multi-receipt days do not exceed policy limits.
- **Role-Based Workspaces:**
  - **Employee Portal:** Submit receipts, preview extraction, correct fields with provenance tracking, answer clarification requests, and view decision history.
  - **Finance Workspace:** Filterable Review Queue with summary counters, side-by-side receipt evidence inspection, policy findings breakdown, single & bulk approvals with backend revalidation, and audit timeline.
  - **Policy Workspace:** Upload raw policy text, Gemini-assisted rule structuring, clause breakdown, unsupported clause identification, and version activation.
  - **Batch Import:** Upload multi-file receipts, map to designated employees, and trigger automated extraction and policy evaluation.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **Database & Auth:** Supabase PostgreSQL with Row Level Security (RLS) & Supabase SSR Auth
- **Storage:** Private Supabase Storage bucket (`receipts`) with signed upload/download URLs
- **AI / LLM:** Google Gemini API (`gemini-2.5-flash` / `gemini-3.8-flash` configurable via `GEMINI_MODEL`)
- **Arithmetic:** `decimal.js` for precise financial rounding and accumulation
- **Icons:** `lucide-react`
- **Testing:** Node.js native test runner via `tsx`

---

## 📋 Setup & Installation

### 1. Prerequisites
- Node.js 18+ (tested on Node.js 24)
- A Supabase project
- A Google Gemini API key

### 2. Environment Variables
Copy `.env.example` to `.env.local` inside `claimlane/`:
```bash
cp .env.example .env.local
```
Fill in the credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Database Migrations
Execute the SQL migrations located in `supabase/migrations/` in order (via the Supabase SQL Editor or Supabase CLI):
1. `20261018000001_initial_schema.sql` — Companies, memberships, expenses, policy versions, evaluations, audit events.
2. `20261018000002_rls_policies.sql` — Row Level Security policies enforcing company and role boundaries.
3. `20261018000003_storage_buckets.sql` — Private receipt storage bucket with access restrictions.

---

## 👥 Setup for 1 Finance & 2 Employee Accounts

### Step 1: Create Auth Users
In your Supabase Dashboard under **Authentication > Users**, create three user accounts (or sign up via the `/login` screen):
1. **Finance Lead:** `finance@acme.com` (Password: user's choice)
2. **Employee 1:** `alex.chen@acme.com` (Password: user's choice)
3. **Employee 2:** `sarah.miller@acme.com` (Password: user's choice)

### Step 2: Assign Company & Roles
Run the following SQL in the Supabase SQL Editor to associate the auth users with the demo company and roles:
```sql
-- Ensure demo company exists
INSERT INTO companies (name, slug)
VALUES ('Acme Global Technologies', 'acme-tech')
ON CONFLICT (slug) DO NOTHING;

-- Map users to memberships
DO $$
DECLARE
  v_company_id UUID;
  v_finance_id UUID;
  v_emp1_id UUID;
  v_emp2_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'acme-tech';
  SELECT id INTO v_finance_id FROM auth.users WHERE email = 'finance@acme.com';
  SELECT id INTO v_emp1_id FROM auth.users WHERE email = 'alex.chen@acme.com';
  SELECT id INTO v_emp2_id FROM auth.users WHERE email = 'sarah.miller@acme.com';

  -- Finance Lead
  IF v_finance_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, company_id, role, display_name, email)
    VALUES (v_finance_id, v_company_id, 'finance', 'Elena Rostova (Finance Lead)', 'finance@acme.com')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'finance';
  END IF;

  -- Employee 1
  IF v_emp1_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, company_id, role, display_name, email)
    VALUES (v_emp1_id, v_company_id, 'employee', 'Alex Chen (Sales Director)', 'alex.chen@acme.com')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'employee';
  END IF;

  -- Employee 2
  IF v_emp2_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, company_id, role, display_name, email)
    VALUES (v_emp2_id, v_company_id, 'employee', 'Sarah Miller (Senior Engineer)', 'sarah.miller@acme.com')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'employee';
  END IF;
END $$;
```

### Step 3: Seed Sample Policy & Fixtures
Once logged in or via curl, trigger the seed endpoint:
```bash
curl -X POST http://localhost:3000/api/seed
```
This initializes the active policy rules (v1) and seeds representative receipt fixtures covering clean claims, daily cap triggers, duplicates, and exceptions.

---

## 🧪 Policy Coverage Checklist & Acceptance Tests

| Policy Clause | Description | Implemented Rule | Test Case & Verification |
|---|---|---|---|
| **Clause 1.1** | Legible receipt with date, merchant, total | Required field checks | `Test 1, 7` in `tests/policy-engine.test.ts` |
| **Clause 1.2** | Itemized receipts mandatory for lodging & meals >$50 | `policy_itemization_mandatory` | `Test 6`: Incomplete itemization flagged |
| **Clause 1.3** | Line item sums must match printed totals | `integrity_arithmetic_check` | `Test 8`: Discrepancy preserved & highlighted |
| **Clause 2.1** | Office meals capped at $25.00/day | `rule_meal_office_daily_cap` | `Test 3`: $34.50 in office fails $25 cap |
| **Clause 2.2** | Business travel meals capped at $75.00/day | `rule_meal_travel_daily_cap` | `Test 3`: $34.50 on travel passes $75 cap |
| **Clause 2.3** | Tier 1 high-cost cities travel cap elevated to $100 | `isTier1City` logic | `Test 12`: $90 meal in New York passes |
| **Clause 2.4** | Multi-receipt daily accumulation | `daily_cap` aggregation | `Test 4`: $45 + $40 = $85 fails $75 daily cap |
| **Clause 3.1** | Client name mandatory for entertainment | `policy_client_name_required` | `Test 2`: Missing client name fails check |
| **Clause 3.2** | Client entertainment $100/attendee limit | `rule_client_entertainment_attendee_cap` | `Test 10`: $720 for 8 attendees ($90/person) |
| **Clause 3.3** | Executive approval threshold >$500 | `rule_client_entertainment_exec_threshold` | `Test 10`: Escalated as `needs_review` |
| **Clause 4.2** | Discretionary boutique hotel guideline | Unsupported clause | Flagged in Policy Workspace as non-computable |
| **Clause 5.1** | Prohibited items (tobacco, gambling, minibar) | `rule_prohibited_items` | `Test 9`: Minibar item fails, reimbursable set to $0 |
| **Clause 6.1** | Currency ambiguity check | `normalized_currency` check | `Test 7`: Ambiguous currency marked unknown |

Run the unit test suite:
```bash
npm test
```
Result: **15 passed, 0 failed (100% pass rate)**.

---

## 🏃 Running the Application

### Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm run start
```

---

## ☁️ Deployment to Vercel

1. Push this monorepo to GitHub.
2. Import project in Vercel. Set Root Directory to `claimlane/`.
3. Configure Environment Variables in Vercel settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash`
4. Click **Deploy**.
