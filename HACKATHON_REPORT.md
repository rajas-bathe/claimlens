# ClaimLens: review remediation and hackathon readiness
Updated October 18, 2026. This report supersedes the earlier UI-only assessment.

## What changed
The six reported failures were reproduced locally before correction. The corrected evaluator is version 3.0.0. Individual submission, correction, reevaluation and individual/bulk finance decisions now share the production review service and guarded database functions.

| Original failure | Root cause | Corrected behavior | Evidence |
| --- | --- | --- | --- |
| Another employee consumed a personal allowance | History accumulation omitted employee boundaries | Personal limits filter employee, company, applicable period, category and context; company duplicate search stays separate | Financial-boundary tests and actual bulk review transaction |
| EUR added to USD | Original numbers accumulated without compatible monetary units | Requires confirmed matching currency or a positive dated, sourced conversion; otherwise unresolved with contributor evidence | Mixed-currency and conversion tests, persisted conversion transaction |
| Unrelated fixed policy after parser failure | Sample-policy fallback on missing key/provider errors | No fallback; explicit recoverable parsing failure or source saved for manual review | Missing-key and source-reference validation tests |
| Inferred USD passed | Normalized value treated as confirmed | Material inferred currency stays unresolved until explicit sourced human confirmation; ordinary submission does not imply confirmation | Engine and production correction/approval transaction tests |
| Blank extraction reconciled as zero | Missing values coerced into arithmetic operands | Null stays missing; reconciliation needs sufficient evidence; an inferred final amount is not a printed total | Empty-vs-zero regression and live cropped-receipt failure/rerun |
| Monthly/conditional/city rules overstated | Daily-only aggregation and hardcoded city amount | Daily/monthly periods, supported conditions and explicit exceptions use configured values; unsupported or conflicting constructs remain unresolved | Monthly, condition, city-37 and unsupported-rule tests |

Prohibited item deductions also identify source rows: overlapping keywords/rules deduct a row once, two identical real rows remain two items, and informational flags do not deduct money.

## Decisions, concurrency and audit history
The additive migration creates company revisions, idempotency records and service-only RPC functions. Every expense/policy mutation advances the company revision under the same transaction advisory lock. Review loads a consistent snapshot, calculates using the actual engine, then commits only if the company revision and expense version still match. A conflict reloads and reevaluates; a stale user edit is rejected. Expense changes, evaluation, audit entry and request record commit together. Terminal decisions cannot be silently overwritten; repeated approval does not duplicate history.

The integration suite executes the actual migration SQL in PGlite PostgreSQL and calls the production review service through its Supabase RPC adapter. It covers individual and bulk decisions, competing requests, changed history between calculation and commit, audit-failure rollback, role denial, explicit confirmation and conversion persistence. The former separate arithmetic-loop “bulk concurrency” test was removed.

**Limit:** PGlite uses one database connection. These tests exercise PostgreSQL transactions/revision checks and interleaved application requests; they are not proof of independent multi-connection behavior in deployed Supabase. Run that acceptance check after applying the migration.

## Policy support boundaries
Supported automatic constructs include required fields, per-expense/category/daily/monthly caps, explicit city/context filters and exceptions, approval thresholds, attendee-based client meals, prohibited item checks, itemization and currency requirements. Rules retain their source quotes. Unsupported clauses and uncovered source paragraphs remain visible for finance review.

Per-trip budgets without trip identity, nightly budgets without night counts, company-shared budgets, unsupported operators/fields, subjective clauses and conflicting exceptions are unresolved. No guessed city tiers or limits are inserted. Legacy ambiguous confirmed rules are not silently repaired. Finance should prepare a corrected policy version and confirm it with an effective date. Previous approvals and original evidence are preserved.

One documented target conversion is supported per receipt. A human supplies the rate, date and source; ClaimLens validates and calculates it but does not independently fetch or certify FX rates.

## Product presentation
The landing page now has an editorial paper/evergreen layout, a staged headline reveal, a layered receipt illustration, a quiet drifting receipt background and an interactive Capture → Understand → Decide walkthrough. The example is explicitly illustrative. It pauses on focus, supports keyboard tabs and a playback control, and stops automatic motion for reduced-motion preferences or while out of view. CSS motion adds no animation library.

Employee and finance screens expose currency confirmation and conversion details, contributing receipts, uncertainty versus violations, parser failure recovery, legacy evaluation warnings and correction history. Approval recomputes current evidence on the server regardless of the saved display.

## Verification
Final command results are recorded in PROJECT_STATUS.md. The receipt evaluation report is in artifacts/receipt-evaluation/README.md. The live diagnostic set is small and synthetic; it does not establish general OCR accuracy.

No current authenticated employee/finance browser session was available. A fresh visual inspection of this revision was blocked because the browser checker remained on a disallowed cached connection-error URL. Earlier screenshots in artifacts/design-review predate this landing revision and must not be presented as current proof. Responsive breakpoints, reduced-motion logic and keyboard behavior are implemented, but current browser appearance/interactions remain unverified.

## Deployment and acceptance
1. Apply supabase/migrations/20261018000004_guarded_reviews.sql to the intended existing Supabase project using the normal migration process. Do not reset or reseed. The migration adds guards/functions and preserves existing receipts, policies and decisions.
2. Keep SUPABASE_SERVICE_ROLE_KEY on the server. The review functions intentionally deny direct anonymous/authenticated-role execution. Before the migration is available, guarded write routes return a truthful service-unavailable response.
3. Confirm a supported company policy. Review legacy or unsupported clauses explicitly; do not treat a previously saved green outcome as fresh verification.
4. With real employee and finance accounts, upload, correct/confirm currency, submit, request clarification, answer it and approve/reject. Check saved evaluation/audit and private receipt access.
5. In two independent requests, race approvals/corrections/history arrival and verify one valid final decision and consistent audit events. Repeat the same request ID.
6. After the provider quota resets, finish the four blocked receipt rerun cases and test policy parsing with the configured model. Do not claim those fresh calls already passed.
7. Open the current localhost preview on desktop/mobile, check all workflow tabs and sign-in, and inspect authenticated screens.

No live database migration, reset, seed, policy activation or historic decision rewrite was performed in this work. Deployment and authenticated acceptance remain outstanding; the local implementation and reviewable migration are ready.
