# ClaimLens project status

Updated October 18, 2026.

## Latest release: impact theme, simpler dashboards and reports

The paper/evergreen theme described in the earlier implementation notes below is superseded by a site-wide graphite, ivory and electric-orange identity. The landing page has bold typography, a layered receipt illustration, subtle scan/orbit motion and a keyboard-operable, pausable product walkthrough. Sign-in and employee/finance workspaces share the new theme. Expense lists have one progress column, policy cards use readable labels and source disclosures, and the overview links directly to report generation.

Reports are available at `/dashboard/reports` for both roles: date/status filters, generated preview, CSV download and a dedicated print/PDF layout. Employees see their own company claims; finance sees company claims. Scope is checked in both the authenticated query and report model. Confirmed currency totals stay separate; uncertain values stay visible and are excluded from totals. No new migration is needed for this feature.

Navigation now has immediate click feedback, a visible progress indicator, a slow-connection retry state, nested loading skeletons and short page-entry transitions. Repeated session reads share a request-scoped cache. The public landing page avoids an authentication lookup and stays accessible while signed in; dashboard/API authorization remains in place. Actual network latency is not artificially hidden or claimed eliminated.

Verification for this release:

- Full regression suite: **63 passed, 0 failed**. New report tests cover role/company scope, dates/status, exact currency totals, unresolved values, CSV quoting, Unicode, zero and formula-injection protection.
- Final production build and TypeScript: **passed**. Targeted lint for new feature/landing/loading code: **0 errors, 0 warnings**. Full lint: **0 errors, 22 advisory warnings** in existing code.
- Actual browser: inspected landing at desktop and mobile breakpoints; exercised walkthrough tabs and arrow keys; verified the authenticated employee dashboard, Reports navigation/loading, report generation, status filtering, stale-export disabling and CSV download. Mobile report has no page overflow; its table scrolls within its own container.
- The live October 1–18 employee report generated nine claims, kept one unresolved currency out of totals, and downloaded the matching CSV. Filtering to Approved regenerated one claim. No financial records were changed.
- Finance-role report access is covered locally by scope tests; a live finance session and a completed OS Save-as-PDF dialog were not exercised. Reduced-motion handling is implemented; browser preference emulation was unavailable.
- New screenshots are under `artifacts/design-review/impact-*`. See `DESIGN_AND_REPORTS.md` for feature behavior and limits. Earlier screenshots/reports describe the prior design.

## Earlier correctness remediation (historical release notes)

## Current result

The independent review's six correctness defects are addressed in the implementation. Evaluator 3.0.0 uses scoped allowances, compatible monetary units, documented conversions, preserved uncertainty, source-backed policy rules, supported conditions/exceptions and explicit unresolved findings. Individual and bulk review share guarded transactional persistence.

The professional paper/evergreen interface is preserved and extended with a new editorial landing page, natural headline/receipt animation, low-contrast drifting background receipts and an interactive, pausable capability walkthrough. Responsive and reduced-motion behavior is implemented. A production stylesheet-loader defect was found in generated HTML and corrected: Tailwind now processes globals.css while native CSS Modules preserve scoped landing classes.

The implementation and migration are ready for deployment checks. **The additive database migration has not been applied to live Supabase.** Guarded writes require it and return service-unavailable when it is missing. No production receipts, confirmed policies or historical decisions were reset, reseeded or rewritten.

## Verification

- Full regression suite: **49 passed, 0 failed**, including eight tests using the real migration SQL and production review service in PGlite PostgreSQL.
- Additional financial-boundary check after final deduction changes: **10 passed, 0 failed**.
- TypeScript: **passed**.
- Production build: **passed**; existing Next.js middleware convention deprecation remains. Scoped landing classes verified in generated HTML/CSS.
- Full ESLint: **0 errors**; advisory unused-variable and native receipt image warnings remain.
- Concurrent verification briefly exhausted host memory (lint allocation failure and one PGlite initialization failure). Running the checks separately completed successfully: all 49 tests passed and lint returned 0 errors / 14 warnings.
- Live receipt extraction: initial **9/10** critical-field cases passed; the crop failure was fixed. Fresh rerun: **6/6 completed cases passed**, **4 provider quota errors**. Recorded-response replay: **10/10**, explicitly not new OCR calls.
- Browser: **current revision not visually verified**. The browser checker is stuck on a cached connection-error page whose URL the tool rejects. Older screenshots in artifacts/design-review belong to the prior design. No authenticated employee/finance session was available.
- PostgreSQL concurrency coverage is local, single-connection PGlite with interleaved production commands and revision conflicts; deployed multi-connection Supabase acceptance remains outstanding.
- No live policy parser call was completed during this remediation; missing-key/invalid source handling is locally tested. Provider quota prevents the remaining fresh extraction calls.

## Review and deployment documents

- HACKATHON_REPORT.md: defect/root-cause/result matrix, decision safeguards, policy limits and deployment acceptance.
- artifacts/receipt-evaluation/README.md: diagnostic methodology, failure evidence and honest limits.
- supabase/migrations/20261018000004_guarded_reviews.sql: additive revision/transaction/idempotency/activation guards.
- PROJECT_STATUS_HISTORY.md: preserved earlier reports, superseded for current behavior.

## Required acceptance

Apply the new migration through the intended project's normal migration workflow without a database reset. Verify employee upload/correction/confirmation, finance clarification and decisions, private evidence access, policy activation dates and independent concurrent requests with real accounts. Inspect current desktop/mobile layouts and reduced-motion behavior. Finish the quota-blocked extraction rerun after availability returns.

Unsupported policy constructs stay unresolved. Legacy evaluations are labeled and current decisions reevaluate server-side; historical approvals are not retroactively certified or changed. Human-provided FX provenance is stored, not independently certified.

The product is stronger and reviewable, but an updated independent hackathon score should wait for deployed acceptance checks. No new judge score is asserted from local tests alone.

# Receipt evidence and workflow update — October 18, 2026

Added capture-quality guidance, optional local English OCR with word overlays and low-confidence rotation retries, explicit critical-evidence confirmation, repeated-invoice/split/near-threshold review signals, and source-policy minimum/calendar-day deadline support. Tightened draft/first-submission handling, self-approval, direct financial writes and receipt privacy. See [RECEIPT_WORKFLOW.md](RECEIPT_WORKFLOW.md) for the actual employee/finance process and limitations.

Validation: 74 automated checks pass, including the additive migration in a local PostgreSQL-compatible test database; actual local OCR was run on all ten synthetic fixtures. These diagnostics do not establish real-world handwriting, capture-quality or fraud-detection accuracy. No new live Gemini benchmark was run. Migration `20261018000005_evidence_and_workflow.sql` must be applied after migration 04 to the connected Supabase database before deploying this code; it has not been remotely installed during this task.
