import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpensePolicy } from "../src/lib/policy/engine";
import { detectPatterns } from "../src/lib/receipts/patterns";
import { assessPixels } from "../src/lib/receipts/quality";
import {
  evidenceSnapshot,
  evidenceReviewValid,
} from "../src/lib/receipts/verification";
import { SAMPLE_RECEIPT_FIXTURES } from "../src/lib/fixtures/sample-data";
import type { Expense, PolicyRule } from "../src/types";

const claim = {
  ...SAMPLE_RECEIPT_FIXTURES[0],
  id: "target",
  merchant: "Test merchant",
  expense_date: "2026-10-12",
  original_currency: "USD",
  original_amount: 95,
  review_status: "submitted",
  extraction_raw: null,
} as Expense;
const cap = {
  id: "threshold",
  type: "per_expense_cap",
  source_clause: "4.1",
  supporting_text: "Each claim is limited to 100 USD.",
  limit: 100,
  limit_currency: "USD",
  aggregation_scope: "per_expense",
  limit_basis: "per_claim",
  conditions: [],
  exceptions: [],
  categories: null,
  cities: null,
  trip_contexts: null,
  required_field: null,
  prohibited_values: null,
  outcome: "block",
} as PolicyRule;
function check(expense: Expense, rule: PolicyRule) {
  return evaluateExpensePolicy({
    expense,
    activePolicyRules: [rule],
    spendingHistory: [],
    candidateDuplicates: [],
  }).rule_results.find((r) => r.rule_id === rule.id)!;
}

test("Minimums apply only when supplied by policy; exact minimum passes and under-minimum fails", () => {
  const rule = { ...cap, type: "minimum_amount", limit: 10 } as PolicyRule;
  assert.equal(
    check({ ...claim, original_amount: 9.99 }, rule).outcome,
    "fail",
  );
  assert.equal(check({ ...claim, original_amount: 10 }, rule).outcome, "pass");
  assert.equal(
    check(claim, { ...rule, aggregation_scope: "monthly" }).outcome,
    "unknown",
  );
  const without = evaluateExpensePolicy({
    expense: claim,
    activePolicyRules: [],
    spendingHistory: [],
    candidateDuplicates: [],
  });
  assert.ok(
    !without.rule_results.some(
      (r) =>
        r.rule_type === "minimum_amount" ||
        r.rule_type === "submission_deadline",
    ),
  );
});
test("Deadline uses original first submission, handles inclusive boundary and missing legacy history", () => {
  const deadline = {
    ...cap,
    type: "submission_deadline",
    limit: null,
    limit_currency: null,
    deadline_days: 7,
    deadline_basis: "calendar_days",
  } as PolicyRule;
  assert.equal(
    check({ ...claim, first_submitted_at: "2026-10-19T23:59:00Z" }, deadline)
      .outcome,
    "pass",
  );
  assert.equal(
    check({ ...claim, first_submitted_at: "2026-10-20T00:00:00Z" }, deadline)
      .outcome,
    "fail",
  );
  assert.equal(
    check({ ...claim, first_submitted_at: null }, deadline).outcome,
    "unknown",
  );
  assert.equal(
    check(claim, {
      ...deadline,
      deadline_basis: "business_days" as "calendar_days",
    }).outcome,
    "unknown",
  );
});
test("Split signal explains same-day related claims without asserting intent or combining other employees", () => {
  const peer = { ...claim, id: "peer", original_amount: 10 };
  const signals = detectPatterns(claim, [peer], [cap]);
  assert.equal(
    signals.find((s) => s.kind === "possible_split")?.details.combined_amount,
    105,
  );
  assert.equal(signals[0].details.intent_established, false);
  for (const change of [
    { employee_id: "other" },
    { company_id: "other" },
    { original_currency: "EUR" },
    { expense_date: "2026-10-11" },
    { review_status: "draft" },
  ]) {
    assert.equal(
      detectPatterns(claim, [{ ...peer, ...change } as Expense], [cap]).length,
      0,
    );
  }
});
test("Near-threshold signal spans 30 days; ignores old claims and conditional thresholds", () => {
  const history = [
    { ...claim, id: "one", expense_date: "2026-10-11" },
    { ...claim, id: "two", expense_date: "2026-10-10" },
  ];
  assert.ok(
    detectPatterns(claim, history, [cap]).some(
      (s) => s.kind === "near_threshold",
    ),
  );
  assert.equal(
    detectPatterns(
      claim,
      history.map((e) => ({ ...e, expense_date: "2026-08-01" })),
      [cap],
    ).length,
    0,
  );
  assert.equal(
    detectPatterns(claim, history, [
      {
        ...cap,
        conditions: [{ field: "city", operator: "eq", value: "London" }],
      } as PolicyRule,
    ]).length,
    0,
  );
});
test("Repeated merchant invoice numbers are compared across employees but remain review signals", () => {
  const confirmed = {
    invoice_number: {
      value: "INV-123",
      source: "employee",
      updated_by: "actor",
      updated_at: "2026-10-12",
    },
  } as Expense["confirmed_fields"];
  const target = { ...claim, confirmed_fields: confirmed };
  const signal = detectPatterns(
    target,
    [{ ...target, id: "other", employee_id: "colleague" }],
    [],
  );
  assert.equal(signal[0]?.kind, "repeated_invoice");
  assert.match(signal[0].message, /legitimately repeat/);
  assert.equal(
    detectPatterns(
      target,
      [{ ...target, id: "other", company_id: "other" }],
      [],
    ).length,
    0,
  );
});
test("Capture heuristics flag blank/faded overexposure and soft edges without changing original pixels", () => {
  const blank = new Uint8Array(64 * 64 * 4).fill(255),
    copy = blank.slice();
  const result = assessPixels(blank, 64, 64);
  assert.ok(result.issues.some((i) => i.kind === "glare"));
  assert.ok(result.issues.some((i) => i.kind === "faded"));
  assert.deepEqual(blank, copy);
  const gradient = blank.slice();
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      for (let c = 0; c < 3; c++) gradient[(y * 64 + x) * 4 + c] = x * 3;
  assert.ok(
    assessPixels(gradient, 64, 64).issues.some((i) => i.kind === "blur"),
  );
});
test("Human evidence confirmation expires when values or independent OCR change", () => {
  const reviewed = {
    ...claim,
    confirmed_fields: {
      ...claim.confirmed_fields,
      critical_evidence: {
        value: evidenceSnapshot(claim),
        source: "employee",
        updated_by: "actor",
        updated_at: "2026-10-12",
      },
    },
  } as Expense;
  assert.equal(evidenceReviewValid(reviewed), true);
  assert.equal(
    evidenceReviewValid({ ...reviewed, original_amount: 96 }),
    false,
  );
  assert.equal(
    evidenceReviewValid({
      ...reviewed,
      ocr_evidence: { checked_at: "new" },
    } as Expense),
    false,
  );
});
