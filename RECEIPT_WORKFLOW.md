# ClaimLens: workflow and receipt safeguards

## What access means

A person signs in with Supabase Auth, but an account alone does not grant workspace access. A trusted administrator must provision a `memberships` row linking that auth user to a company and an employee or finance role. The application currently has no invitation or eligible-ID management screen. Finance does not open a receipt submission window or pre-authorize individual bill IDs. A registered company employee can submit a business claim, which still requires policy checks and a finance decision. The backend derives company and owner identity from the signed-in membership rather than trusting fields in an upload request.

Submission is a request, approval is a recorded finance decision, and payment happens outside this application. There is no bank transfer or paid/reimbursed status here. Finance's batch import can submit receipts on behalf of an existing company member; it does not automatically approve them.

## Actual sequence

1. Finance uploads/pastes the company's policy, reviews proposed structured rules and unsupported clauses, and confirms an effective policy version. A parse failure does not install sample rules. A receipt outside an effective policy period remains unresolved.
2. An employee uploads a receipt into a draft. The original private file and its hash are preserved. Browser capture checks give early feedback; the server independently checks the uploaded image.
3. Gemini reads the image/document into structured fields, source quotations, uncertainty and itemization. A compatible provider can be used on a transient primary failure. Missing evidence stays missing. The image is treated as data, never instructions.
4. The employee compares the extraction with the original, corrects fields and supplies business context: trip/office, city, purpose, client and attendees as applicable. Inferred currency requires explicit confirmation. A draft is not submitted just because checks ran.
5. Optional **Run OCR** independently reads English printed text locally using Tesseract. It retains word boxes, text and confidence. Low-confidence readings retry quarter-turn orientations on an in-memory derivative, then map boxes back to the original. OCR does not replace saved financial fields, reconstruct missing ink or change the original file.
6. Merchant/date/amount/currency tabs locate matching OCR words on the original. Matches can be repeated or wrong: a highlighted word is evidence to inspect, not a guarantee that it belongs to that field. Model source quotations are clearly distinguished from OCR locations.
7. Quality warnings, uncertain critical extraction or OCR discrepancies require explicit human comparison and confirmation. The recorded actor, time and values are bound to the current extraction, quality check and OCR. Changed values or evidence invalidate that confirmation. Finance cannot bypass unresolved critical evidence with an exception reason alone.
8. Submission runs deterministic rules against the applicable policy and current submitted company history. Personal spending sums stay scoped to the employee and relevant date/category/context/currency. Mixed currencies require a documented conversion. Arithmetic, exact/probable duplicates and policy exceptions remain separate findings.
9. Finance sees the original, corrections, evidence, policy clauses, related-claim reasons and audit history. It can request clarification, reject with a reason, or approve. Non-passing policy/pattern findings need a recorded exception reason; unresolved critical financial evidence still blocks approval. A different finance reviewer must approve finance's own claim.
10. Every decision rechecks current history and policy. The database transaction saves evaluation, decision and audit together, rejects stale versions and avoids repeated-command duplication. Individual and bulk approval use the same service. Reports summarize recorded decisions, not bank payments.

## New checks and their boundaries

| Requirement | Implemented behavior | Boundary |
|---|---|---|
| Blur / faded print | Pixel edge/contrast heuristics, plus vision-reported warnings and retake guidance | Not a calibrated legibility classifier; defects can be missed |
| Glare / cutoff / distortion | Conservative clipping/edge signals, optional vision warnings, OCR edge/tilt signals | White paper alone is not glare; absent cropped content cannot always be detected |
| Crumpled / rotated | Original zoom/pan/rotate; vision interpretation; EXIF handling and low-confidence OCR rotation retries | No general dewrinkling, perspective repair or generated cleaned receipt |
| Erased ink / missing total or date | Preserve uncertainty, show original, request better evidence | Cannot recover information that no longer exists |
| Handwriting / overwritten text | Vision extraction and human comparison; independent printed-text OCR is optional | No demonstrated real-world handwriting or alteration-detector accuracy |
| Repeated invoices | Company-wide same merchant + normalized invoice review signal, including different employees | Legitimate repeated numbering exists; not an accusation |
| Split purchases | Same employee, merchant, expense date, category, context and confirmed currency; individually under an applicable simple per-claim threshold but combined above | Heuristic signal, not proof. Conditional/exception-based, attendee-based and mixed-currency thresholds are not guessed |
| Near-threshold pattern | At least three related claims in an inclusive 30-day window within 90–100% of a simple threshold | Heuristic band is disclosed; no automatic rejection |
| Minimum amount | Only configured per-claim source-policy minimums are evaluated | No invented universal minimum |
| Submission deadline | Explicit calendar-day rule, inclusive deadline, recorded first submission retained on resubmission | UTC calendar dates; business-day, month/trip-end and timezone-specific conventions remain manual. Legacy claims without first-submission history remain unresolved |
| Fake / somebody else's receipt | Explainable anomalies and finance review | No merchant verification, payment-card reconciliation, proof of payer or reliable forgery certification |

## Bugs addressed in this change

- Draft reevaluation no longer submits a draft. Finance batch import explicitly submits after extraction.
- Finance self-approval is denied in the application and database transaction.
- Receipt file read access is restricted to the owner or company finance, replacing company-wide employee visibility.
- Direct authenticated financial-table writes are revoked; authorized backend handlers and guarded service-only transactions perform writes.
- OCR persistence uses compare-and-swap with an audit event; it cannot overwrite a newer correction or final decision.
- Extraction retries reuse the uploaded draft, and batch retries avoid extracting again after an already successful extraction.
- Sample initialization is disabled by default, finance-only when explicitly enabled, and never runs through GET.
- Sign-in now explains missing company membership; the auth callback rejects external redirects.

## Deployment and verification

Apply `supabase/migrations/20261018000005_evidence_and_workflow.sql` **after migration 04 and before deploying the new application**. It adds evidence columns and first-submission tracking, extends the guarded transaction, installs atomic OCR persistence and tightens access. It does not reset claims or invent historical submission dates. The migration deliberately fails if the prior guarded function does not match its expected structure. Use normal database migration tooling with an administrator connection; never expose a database/service key in the browser.

The migration has been executed in the local PostgreSQL-compatible integration tests. It has **not been applied to the connected Supabase project in this task**. New extraction/decisions fail with setup guidance while the database is still on the old schema. Full authenticated end-to-end persistence therefore remains a deployment check, not a claimed live result.

Authenticated browser verification at `http://localhost:3000` confirmed the finance overview and receipt review controls. A read-only schema query returned PostgreSQL `42703` for the absent `capture_quality` column. Exercising the OCR button displayed the migration prerequisite and confirmed that the claim was unchanged. The demo account credentials authorize normal application access, not database administration. No sample initialization, approval, rejection or policy activation was performed against existing demo records.

Employee demo sign-in also succeeded and displayed the company-scoped expense list, draft/submitted states and upload entry point. The browser remains on that employee workspace for inspection. Successful new upload/extraction/decision persistence is not claimed while migration 05 is missing.

`npm test`: 74 passing automated checks, including real local SQL transaction tests for draft preservation, first-submission retention, non-overridable evidence review, confirmation persistence, OCR audit/CAS, self-approval and direct-write denial. Existing checks also cover monthly/daily accumulation, policy/currency boundaries, duplicate signals, arithmetic, stale concurrent decisions, rollback, authorization and reports. Provider fallback and corpus replay tests use recorded/mocked responses; these are not new live provider accuracy tests.

`node --import tsx scripts/evaluation/ocr.ts`: actual local OCR on ten deterministic synthetic receipt fixtures. Full text, boxes, timings, heuristic warnings and simple expected-string comparisons are recorded in `artifacts/receipt-evaluation/ocr-results.json`. Sideways reading initially failed and now reads the fixture after rotation retries. Clean, EUR and arithmetic-inconsistent printed values are found; arithmetic correctness is separately evaluated by policy code. Cropped/erased critical fields remain unavailable. A dollar symbol does not establish USD. The handwriting fixture uses an italic font, so it does not validate authentic handwriting performance. This is a small diagnostic set, not a real-world accuracy benchmark.

## Honest judge explanation

We reused pretrained vision and OCR rather than claiming to train a receipt model overnight. The engineering contribution is the controlled decision workflow: retain originals, expose uncertainty and source evidence, cross-check printed text, apply auditable deterministic policy/history rules, require human verification and record finance decisions atomically. OCR adds an independent transcription and locations; it does not certify extraction, payer identity or document authenticity. A production system still needs representative real-receipt evaluation, multilingual/PDF OCR, calibrated capture checks, payment matching and merchant/invoice verification.

References: [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [Tesseract.js documented capabilities and PDF limitations](https://github.com/naptha/tesseract.js/).
