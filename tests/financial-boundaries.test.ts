import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExpensePolicy,
  checkDuplicates,
} from "../src/lib/policy/engine";
import { normalizeExtractionAmounts } from "../src/lib/gemini/extract";
import {
  structurePolicyDocument,
  validateStructuredPolicy,
} from "../src/lib/gemini/policy";
import type { Expense, PolicyRule, ExtractionResult } from "../src/types";
const base = {
  id: "claim-a",
  company_id: "company-a",
  employee_id: "employee-a",
  merchant: "Test Cafe",
  expense_date: "2026-10-12",
  original_amount: 20,
  original_currency: "USD",
  category: "Business meals",
  trip_context: "office",
  city: "Pune",
  review_status: "submitted",
  confirmed_fields: {},
} as Expense;
const rule = {
  id: "office-cap",
  type: "daily_cap",
  source_clause: "Meals",
  supporting_text: "Office meals are capped at $25 USD per employee per day.",
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
  trip_contexts: ["office"],
} as PolicyRule;
const evaluate = (
  expense: Expense = base,
  history: Expense[] = [],
  rules: PolicyRule[] = [rule],
) =>
  evaluateExpensePolicy({
    expense,
    activePolicyRules: rules,
    spendingHistory: history,
    candidateDuplicates: [],
  });
const result = (e: ReturnType<typeof evaluate>, id = rule.id) =>
  e.rule_results.find((r) => r.rule_id === id)!;
test("Personal allowance excludes other employees and other companies while duplicate checks remain company-wide", () => {
  const other = {
    ...base,
    id: "claim-b",
    employee_id: "employee-b",
    original_amount: 10,
    review_status: "approved",
  } as Expense;
  assert.equal(result(evaluate(base, [other])).outcome, "pass");
  assert.equal(
    result(
      evaluate(base, [
        {
          ...other,
          employee_id: base.employee_id,
          company_id: "other-company",
        },
      ]),
    ).outcome,
    "pass",
  );
  assert.equal(result(evaluate(base, [other])).details.prior_total, 0);
  const duplicate = { ...other, original_amount: 20 };
  assert.equal(checkDuplicates(base, [duplicate]).length, 1);
  assert.equal(
    checkDuplicates(base, [{ ...duplicate, company_id: "other-company" }])
      .length,
    0,
  );
});
test("Mixed currencies without a conversion are unresolved, never added as equal values", () => {
  const other = {
    ...base,
    id: "claim-b",
    original_currency: "EUR",
    original_amount: 10,
    review_status: "approved",
  } as Expense;
  const finding = result(evaluate(base, [other]));
  assert.equal(finding.outcome, "unknown");
  assert.deepEqual(finding.details.unresolved_expense_ids, ["claim-b"]);
  assert.equal(evaluate(base, [other]).reimbursable_amount, null);
});
test("A documented dated conversion is used and its contributor provenance is retained", () => {
  const other = {
    ...base,
    id: "claim-b",
    original_currency: "EUR",
    original_amount: 10,
    converted_currency: "USD",
    converted_amount: 11,
    exchange_rate: 1.1,
    exchange_rate_source: "Test approved rate document",
    exchange_rate_date: "2026-10-12",
    review_status: "approved",
  } as Expense;
  const finding = result(evaluate(base, [other]));
  assert.equal(finding.outcome, "fail");
  assert.equal(finding.details.prior_total, 11);
  assert.equal(finding.details.combined_total, 31);
  assert.equal(
    (finding.details.contributions as { exchange_rate_source: string }[])[0]
      .exchange_rate_source,
    "Test approved rate document",
  );
  assert.equal(
    result(evaluate(base, [{ ...other, converted_amount: 12 }])).outcome,
    "unknown",
  );
});
test("Monthly category cap includes earlier days in that month and excludes the previous month", () => {
  const monthly = {
    ...rule,
    id: "monthly",
    type: "category_cap",
    aggregation_scope: "monthly",
    limit: 100,
  } as PolicyRule;
  const other = {
    ...base,
    id: "previous",
    original_amount: 90,
    expense_date: "2026-10-11",
    review_status: "approved",
  } as Expense;
  const finding = result(evaluate(base, [other], [monthly]), "monthly");
  assert.equal(finding.outcome, "fail");
  assert.equal(finding.details.combined_total, 110);
  assert.equal(
    result(
      evaluate(base, [{ ...other, expense_date: "2026-09-30" }], [monthly]),
      "monthly",
    ).outcome,
    "pass",
  );
});
test("Inferred USD requires sourced human confirmation, including when the value stays unchanged", () => {
  const inferred = {
    ...base,
    extraction_raw: {
      currency_is_inferred: true,
      normalized_currency: { value: "USD", source: "derived" },
      printed_currency: { value: "$" },
    },
  } as Expense;
  assert.equal(evaluate(inferred).overall_outcome, "unknown");
  const confirmed = {
    ...inferred,
    confirmed_fields: {
      original_currency: {
        value: "USD",
        source: "employee",
        updated_at: "2026-10-18",
        updated_by: "employee-a",
      },
    },
  } as Expense;
  assert.equal(evaluate(confirmed).overall_outcome, "pass");
});
test("Empty extraction stays missing and cannot reconcile as a genuine zero", () => {
  const empty = {
    line_items: [],
    subtotal: { value: null },
    tax: { value: null },
    total: { value: null },
  } as unknown as ExtractionResult;
  normalizeExtractionAmounts(empty);
  assert.equal(empty.amount_breakdown?.final_total, null);
  assert.equal(empty.arithmetic_check?.discrepancy, null);
  const zero = {
    ...empty,
    line_items: [{ description: "Free sample", amount: 0 }],
    itemization_completeness: "complete",
    tax: { value: 0 },
    subtotal: { value: 0 },
    total: { value: 0 },
  } as ExtractionResult;
  normalizeExtractionAmounts(zero);
  assert.equal(zero.amount_breakdown?.final_total, 0);
  assert.equal(zero.arithmetic_check?.discrepancy, 0);
});
test("Explicit city exceptions and numeric conditions apply actual configured values without a hardcoded tier", () => {
  const configured = {
    ...rule,
    exceptions: [
      {
        condition: { field: "city", operator: "eq", value: "Pune" },
        override: { limit: 37 },
        note: "Explicit Pune limit.",
      },
    ],
    conditions: [{ field: "original_amount", operator: "gte", value: 10 }],
  } as PolicyRule;
  const finding = result(
    evaluate({ ...base, original_amount: 36 }, [], [configured]),
  );
  assert.equal(finding.outcome, "pass");
  assert.equal(finding.details.limit, 37);
  assert.equal(
    result(evaluate({ ...base, original_amount: 9 }, [], [configured])).outcome,
    "not_applicable",
  );
});
test("Unsupported periods, conditions and conflicting exceptions remain unknown", () => {
  assert.equal(
    result(evaluate(base, [], [{ ...rule, aggregation_scope: "per_trip" }]))
      .outcome,
    "unknown",
  );
  assert.equal(
    result(
      evaluate(
        base,
        [],
        [
          {
            ...rule,
            conditions: [
              { field: "untracked_field", operator: "eq", value: 1 },
            ],
          },
        ],
      ),
    ).outcome,
    "unknown",
  );
  const conflicts = [30, 40].map((limit) => ({
    condition: { field: "city", operator: "eq", value: "Pune" },
    override: { limit },
    note: "Test exception",
  }));
  assert.equal(
    result(
      evaluate(base, [], [{ ...rule, exceptions: conflicts } as PolicyRule]),
    ).outcome,
    "unknown",
  );
});
test("Policy parser failure never substitutes unrelated template rules", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      structurePolicyDocument(
        "Office meals cost at most 7 EUR; taxis at most 11 EUR.",
      ),
      /not configured/,
    );
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  }
  assert.throws(
    () =>
      validateStructuredPolicy(
        { structured_rules: [rule], unsupported_clauses: [] },
        "Office meals cost at most 7 EUR.",
      ),
    /traced/,
  );
});
test("Prohibited items matching multiple keywords are deducted once; absent item amounts stay unresolved", () => {
  const prohibited = {
    ...rule,
    id: "prohibited",
    type: "prohibited_item",
    limit: null,
    limit_currency: null,
    aggregation_scope: null,
    prohibited_values: ["minibar", "wine"],
  } as PolicyRule;
  const expense = {
    ...base,
    extraction_raw: {
      itemization_completeness: "complete",
      line_items: [
        { description: "minibar wine", amount: 5 },
        { description: "Lunch", amount: 15 },
      ],
    },
  } as Expense;
  assert.equal(evaluate(expense, [], [prohibited]).reimbursable_amount, 15);
  assert.equal(evaluate(expense, [], [prohibited, { ...prohibited, id: "overlapping" }]).reimbursable_amount, 15);
  assert.equal(evaluate(expense, [], [{ ...prohibited, outcome: "flag" }]).reimbursable_amount, 20);
  const repeatedRows = { ...expense, extraction_raw: { ...expense.extraction_raw!, line_items: [expense.extraction_raw!.line_items[0], expense.extraction_raw!.line_items[0]] } };
  assert.equal(evaluate(repeatedRows, [], [prohibited]).reimbursable_amount, 10);
  assert.equal(
    evaluate(
      {
        ...expense,
        extraction_raw: {
          ...expense.extraction_raw!,
          line_items: [
            {
              description: "minibar wine",
              amount: null,
              quantity: 1,
              unit_price: null,
              page_ref: null,
            },
          ],
        },
      },
      [],
      [prohibited],
    ).overall_outcome,
    "unknown",
  );
});
