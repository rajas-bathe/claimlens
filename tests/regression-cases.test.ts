import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpensePolicy } from "../src/lib/policy/engine";
import { selectPolicyForDate } from "../src/lib/policy/service";
import { SAMPLE_STRUCTURED_RULES } from "../src/lib/fixtures/sample-data";
import { normalizeExtractionAmounts } from "../src/lib/gemini/extract";
import type { Expense, PolicyVersion } from "../src/types";

// ─── Regression Case: Blue Harbor Bistro Receipt ──────────────────────────────

test("Regression 1: Blue Harbor Bistro extraction preserves printed total, handwritten addition, and verifies arithmetic without false discrepancy", () => {
  const blueHarborFixture = {
    id: "exp_blue_harbor",
    company_id: "comp_acme",
    employee_id: "emp_alex",
    merchant: "Blue Harbor Bistro",
    expense_date: "2023-10-24",
    original_amount: 55.96,
    original_currency: "USD",
    currency_is_inferred: true,
    category: "Business meals",
    trip_context: "office",
    processing_status: "extracted",
    review_status: "submitted",
    version: 1,
    extraction_raw: {
      merchant: {
        value: "Blue Harbor Bistro",
        confidence: "high",
        source: "printed",
      },
      printed_date: {
        value: "2023-10-24",
        confidence: "high",
        source: "printed",
      },
      printed_currency: { value: "$", confidence: "high", source: "printed" },
      normalized_currency: {
        value: "USD",
        confidence: "high",
        source: "derived",
      },
      currency_is_inferred: true,
      subtotal: { value: 44.0, confidence: "high", source: "printed" },
      tax: { value: 3.96, confidence: "high", source: "printed" },
      printed_total: { value: 47.96, confidence: "high", source: "printed" },
      handwritten_addition: {
        value: 8.0,
        confidence: "high",
        source: "derived",
      },
      handwritten_addition_label: "Tip / Addition",
      handwritten_final_total: {
        value: 55.96,
        confidence: "high",
        source: "derived",
      },
      total: { value: 55.96, confidence: "high", source: "derived" },
      amount_breakdown: {
        printed_pre_tip_total: 47.96,
        handwritten_addition: 8.0,
        handwritten_addition_label: "Tip / Addition",
        final_total: 55.96,
        currency: "USD",
        reconciliation_formula:
          "16.00 + 28.00 (subtotal 44.00) + 3.96 (tax) + 8.00 (tip) = 55.96",
      },
      arithmetic_check: {
        printed_total: 55.96,
        calculated_total: 55.96,
        discrepancy: 0,
        note: "Arithmetic verified: 44.00 (subtotal) + 3.96 (tax) + 8.00 (handwritten addition) = 55.96",
      },
      line_items: [
        {
          description: "Caesar Salad",
          amount: 16.0,
          quantity: 1,
          unit_price: 16.0,
          page_ref: 1,
        },
        {
          description: "Grilled Salmon",
          amount: 28.0,
          quantity: 1,
          unit_price: 28.0,
          page_ref: 1,
        },
      ],
      missing_fields: ["invoice_number"],
      itemization_completeness: "complete",
    },
    created_at: "2023-10-24T20:30:00Z",
    updated_at: "2023-10-24T20:30:00Z",
  } as unknown as Expense;

  // Check 1: Printed and handwritten components are preserved separately
  normalizeExtractionAmounts(blueHarborFixture.extraction_raw!);
  const ext = blueHarborFixture.extraction_raw!;
  assert.equal(ext.printed_total?.value, 47.96);
  assert.equal(ext.handwritten_addition?.value, 8.0);
  assert.equal(ext.handwritten_final_total?.value, 55.96);
  assert.equal(ext.total?.value, 55.96);
  assert.equal(ext.currency_is_inferred, true);

  // Check 2: Arithmetic does not report a false discrepancy
  assert.equal(ext.arithmetic_check?.discrepancy, 0);
  assert.equal(ext.arithmetic_check?.calculated_total, 55.96);

  // Check 3: Missing invoice number is informational, not a policy-blocking failure unless rule requires it
  assert.ok(ext.missing_fields?.includes("invoice_number"));
});

test("Regression 2: Expense dated in 2023 evaluated against 2026 policy produces an explicit date-check unresolved finding", () => {
  const policyV1 = {
    id: "pol_v1",
    company_id: "comp_acme",
    version_number: 1,
    status: "active",
    effective_from: "2026-01-01",
    effective_to: null,
    confirmed_at: "2026-01-01T00:00:00Z",
    confirmed_by: "user_finance",
    created_by: "user_finance",
    structured_rules: SAMPLE_STRUCTURED_RULES,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as PolicyVersion;

  // Select policy for 2023-10-24
  const found = selectPolicyForDate([policyV1], "2023-10-24");
  assert.equal(
    found,
    null,
    "No policy should be active in 2023 when policy starts in 2026",
  );

  // When policy date rule runs with active policy effective from 2026:
  const blueHarborExpense = {
    id: "exp_bh_2023",
    company_id: "comp_acme",
    employee_id: "emp_alex",
    merchant: "Blue Harbor Bistro",
    expense_date: "2023-10-24",
    original_amount: 55.96,
    original_currency: "USD",
    category: "Business meals",
    trip_context: "office",
    review_status: "submitted",
  } as unknown as Expense;

  const result = evaluateExpensePolicy({
    expense: blueHarborExpense,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
    policyEffectiveFrom: "2026-01-01",
  });

  const dateCheck = result.rule_results.find(
    (r) => r.rule_id === "policy_effective_date_check",
  );
  assert.ok(dateCheck, "policy_effective_date_check must be evaluated");
  assert.equal(dateCheck.outcome, "unknown");
  assert.match(dateCheck.message, /No confirmed policy covers/i);
});

test("Regression 3: Office meal cap rule correctly flags $55.96 expense as exceeding $25 office cap", () => {
  const officeMealExpense = {
    id: "exp_office_meal",
    company_id: "comp_acme",
    employee_id: "emp_alex",
    merchant: "Blue Harbor Bistro",
    expense_date: "2026-02-15",
    original_amount: 55.96,
    original_currency: "USD",
    category: "Business meals",
    trip_context: "office",
    review_status: "submitted",
  } as unknown as Expense;

  const result = evaluateExpensePolicy({
    expense: officeMealExpense,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
    policyEffectiveFrom: "2026-01-01",
  });

  const officeCapRule = result.rule_results.find(
    (r) => r.rule_id === "rule_meal_office_daily_cap",
  );
  assert.ok(officeCapRule, "Office cap rule must be checked");
  assert.equal(officeCapRule.outcome, "fail");
  assert.match(officeCapRule.message, /exceeds.*25.00/i);
});

test("Regression 4: Prohibited items deduction excludes non-reimbursable item from reimbursable amount", () => {
  const dinnerWithMinibar = {
    id: "exp_minibar_snack",
    company_id: "comp_acme",
    employee_id: "emp_alex",
    merchant: "Hotel Grand Dining",
    expense_date: "2026-03-10",
    original_amount: 85.0,
    original_currency: "USD",
    category: "Business meals",
    trip_context: "business_trip",
    city: "Denver",
    review_status: "submitted",
    extraction_raw: {
      line_items: [
        {
          description: "Steak Frites",
          amount: 65.0,
          quantity: 1,
          unit_price: 65.0,
          page_ref: 1,
        },
        {
          description: "Hotel Minibar Snack",
          amount: 20.0,
          quantity: 1,
          unit_price: 20.0,
          page_ref: 1,
        },
      ],
      itemization_completeness: "complete",
    },
  } as unknown as Expense;

  const result = evaluateExpensePolicy({
    expense: dinnerWithMinibar,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
    policyEffectiveFrom: "2026-01-01",
  });

  const prohibitedRule = result.rule_results.find(
    (r) => r.rule_id === "rule_prohibited_items",
  );
  assert.ok(prohibitedRule, "rule_prohibited_items must be found");
  assert.equal(prohibitedRule.outcome, "fail");
  assert.equal(prohibitedRule.details.prohibited_sum, 20.0);
  assert.equal(prohibitedRule.details.adjusted_reimbursable, 65.0);
  assert.equal(result.reimbursable_amount, 65.0);
});
