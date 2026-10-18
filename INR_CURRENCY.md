# INR workspace currency

Primary claim amounts, dashboard totals, reports/CSV and new reimbursement calculations now use INR. INR uses Indian number grouping. Original receipts and original policy quotations retain the currency actually present in the evidence; no historic dollar or euro amount was relabelled as rupees.

Foreign receipts require a positive exchange rate to INR, a real calendar date and a verifiable bank/card/company source. The saved converted amount must agree with original amount × rate. Missing or inferred original currency also requires confirmation. Missing conversion stays pending and is excluded from totals. A finance exception cannot bypass unresolved INR evidence. Changing original currency or amount clears a saved conversion and forces new evidence.

The conversion panel uses INR as its only target and appears for unconverted foreign claims even before an evaluation has been run. Final decisions retain their recorded historical evidence. New evaluations carry `reimbursement_currency: INR` in their input snapshot. Financial policy comparisons still use the actual source policy currency; the engine does not assume a rate or rewrite source limits.

The landing-page examples and editable sample policy use INR. The sample limits are illustrative company-policy choices, not an exchange-rate conversion of the previous dollar policy. New monetary policy activation requires INR limits. Existing active/historical policies are preserved; to replace a USD policy, use Company policy → Use sample text → Prepare rules for review, review the INR rules, then activate with the appropriate effective date. Saving only for manual review intentionally produces no automatic rules.

Policy source-clause cards now use an explicit dark surface with readable text, stronger contrast, preserved line breaks and normal font styling.

Verification: 80 automated tests pass, including PostgreSQL-compatible integration checks proving foreign approval is blocked until INR conversion and then records the correct INR reimbursement. Production build and TypeScript pass. No exchange-rate lookup, fabricated conversion, historical approval rewrite or remote policy activation was performed. No additional Supabase migration is needed after migrations 04 and 05.
