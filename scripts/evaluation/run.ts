import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { extractReceipt } from "../../src/lib/gemini/extract";
import {
  evaluateExpensePolicy,
  checkDuplicates,
} from "../../src/lib/policy/engine";
import type { Expense, PolicyRule } from "../../src/types";
type Expected = {
  merchant: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  inferred?: boolean;
  arithmetic: string;
  printed_total?: number;
  addition?: number;
};
type Case = {
  id: string;
  file: string;
  provenance: string;
  sha256: string;
  expected: Expected;
};
async function main() {
  const root = resolve("tests/receipts");
  const manifest = JSON.parse(
    await readFile(resolve(root, "manifest.json"), "utf8"),
  ) as { cases: Case[] };
  const rows: Record<string, unknown>[] = [];
  const extracted: Expense[] = [];
  const cap = {
    id: "evaluation-cap",
    type: "daily_cap",
    source_clause: "Synthetic evaluation policy",
    supporting_text:
      "Test meals are capped at 25 units of the stated currency per day.",
    limit: 25,
    limit_currency: "USD",
    aggregation_scope: "daily",
    conditions: [],
    exceptions: [],
    required_field: null,
    prohibited_values: null,
    outcome: "block",
    categories: ["Business meals"],
    cities: null,
    trip_contexts: null,
  } as PolicyRule;
  for (const fixture of manifest.cases) {
    if (!process.env.GEMINI_API_KEY) {
      rows.push({
        id: fixture.id,
        status: "unverified",
        reason: "No live provider credentials configured",
      });
      continue;
    }
    try {
      const evidence = await extractReceipt(
        await readFile(resolve(root, fixture.file)),
        fixture.file.endsWith(".jpg") ? "image/jpeg" : "image/png",
      );
      const actual = {
        merchant: evidence.merchant?.value ?? null,
        date: evidence.normalized_date?.value ?? null,
        amount: evidence.amount_breakdown?.final_total ?? null,
        currency: evidence.normalized_currency?.value ?? null,
        inferred: evidence.currency_is_inferred ?? false,
        arithmetic:
          evidence.arithmetic_check?.discrepancy == null
            ? "unresolved"
            : Math.abs(evidence.arithmetic_check.discrepancy) > 0.02
              ? "inconsistent"
              : "reconciled",
        printed_total: evidence.printed_total?.value ?? null,
        addition: evidence.handwritten_addition?.value ?? null,
      };
      const checks = Object.entries(fixture.expected).map(
        ([field, expected]) => ({
          field,
          expected,
          actual: actual[field as keyof typeof actual],
          pass: expected === actual[field as keyof typeof actual],
        }),
      );
      const expense = {
        id: fixture.id,
        company_id: "synthetic-evaluation",
        employee_id: "synthetic-employee",
        merchant: actual.merchant,
        expense_date: actual.date,
        original_amount: actual.amount,
        original_currency: actual.currency,
        category: "Business meals",
        city: "Test city",
        trip_context: "office",
        review_status: "submitted",
        extraction_raw: evidence,
        receipt_file_hash: fixture.sha256,
        confirmed_fields: {},
      } as Expense;
      const decision = evaluateExpensePolicy({
        expense,
        activePolicyRules: [
          { ...cap, limit_currency: actual.currency === "EUR" ? "EUR" : "USD" },
        ],
        spendingHistory: [],
        candidateDuplicates: [],
      });
      const pass = checks.every((check) => check.pass);
      const duplicates = checkDuplicates(expense, extracted).map((d) => ({
        type: d.type,
        id: d.matched_expense_id,
      }));
      rows.push({
        id: fixture.id,
        provenance: fixture.provenance,
        status: pass ? "pass" : "fail",
        checks,
        decision: decision.overall_outcome,
        duplicates,
        evidence,
      });
      extracted.push(expense);
      console.log(
        fixture.id +
          ": " +
          (pass ? "PASS" : "FAIL") +
          " (" +
          checks.filter((c) => c.pass).length +
          "/" +
          checks.length +
          " critical checks), decision " +
          decision.overall_outcome,
      );
    } catch (error) {
      rows.push({
        id: fixture.id,
        status: "provider_error",
        reason: error instanceof Error ? error.message : "Extraction failed",
      });
      console.log(fixture.id + ": provider error");
    }
    await mkdir(resolve("artifacts/receipt-evaluation"), { recursive: true });
    await writeFile(
      resolve("artifacts/receipt-evaluation/results.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          sample_size: manifest.cases.length,
          fixture_type: "synthetic and transformed synthetic only",
          general_accuracy_claim: false,
          results: rows,
        },
        null,
        2,
      ),
    );
  }
  const summary = {
    sample_size: manifest.cases.length,
    completed: rows.filter((r) => r.status === "pass" || r.status === "fail")
      .length,
    passed: rows.filter((r) => r.status === "pass").length,
    failed: rows.filter((r) => r.status === "fail").length,
    provider_errors: rows.filter((r) => r.status === "provider_error").length,
  };
  console.log(JSON.stringify(summary));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
