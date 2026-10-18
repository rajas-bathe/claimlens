# Impact theme and dashboard reports
October 18, 2026

## Product changes
- Graphite surfaces, bright ivory type, electric orange actions and restrained cyan accents across landing, sign-in and employee/finance workspaces. Distinct status colors remain meaningful.
- A bold landing headline, layered receipt illustration, subtle scan/orbit motion and interactive Capture / Understand / Decide walkthrough. Keyboard controls, pause and reduced-motion behavior are included; no animation library or heavy bitmap hero was added.
- Less dashboard repetition: one progress column on expense lists, plain-language policy labels and source clauses in disclosures, relevant status counts and direct report access.
- Immediate navigation progress and a loading message, a slower-connection retry state, nested loading boundaries and short page-entry transitions. Repeated session lookups within one server render share React's request-scoped cache. No cross-user session caching or artificial delay was introduced. Network/database latency still determines actual request duration.

## Reports
Open Reports in either sidebar or Generate report on the finance overview. Choose expense dates and a status, then generate a preview. CSV downloads use the exact generated preview. Print / PDF opens the browser print dialog with a dedicated light, landscape report layout; choose Save as PDF there.

Finance reports include company claims. Employee reports include only the signed-in employee's company claims. Both the authenticated database query and report model enforce scope. The API uses the existing user session and RLS, never a public sample dataset or expanded service permissions.

Reports retain original monetary values, separate confirmed currency totals, exclude unconfirmed amounts from those totals and explain that claim values are not payments or approved reimbursement amounts. Draft and rejected claims are included when All statuses is selected. Claims without expense dates are excluded. The filter allows up to 366 days; large reports over 50,000 rows require a shorter period. Queries paginate beyond Supabase's default result limit.

Exports quote and escape CSV cells, preserve Unicode and numeric zero, and neutralize spreadsheet formula prefixes. No receipt image, private storage URL or raw extraction is exported. Generation is read-only and requires no new database migration.

## Verification
- Full suite: 63 passed, 0 failed, including new scope, date/status, currency, exact arithmetic, uncertainty and CSV safety tests.
- Production build and TypeScript passed.
- Full lint: 0 errors; existing advisory warnings remain.
- Desktop/mobile landing, interactive policy step and keyboard arrow navigation inspected in the actual browser. Final visual proof and authenticated checks are recorded in PROJECT_STATUS.md.
- Authenticated employee dashboard, report generation, status filtering, stale-export protection and CSV download verified live. The CSV headers, claim rows and payment clarification were checked; it contains no private storage link. Live finance-role and OS PDF-save checks remain outstanding.
- The public landing page stays accessible while signed in and skips an unnecessary authentication lookup. Protected route authorization is preserved.

No receipt evidence, policies, decision rules or saved financial decisions were rewritten by this release. Reports describe current records at generation time; they are not an immutable accounting ledger or payment instruction.
