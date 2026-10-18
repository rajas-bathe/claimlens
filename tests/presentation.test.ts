import test from "node:test";
import assert from "node:assert/strict";
import {
  membershipLookup,
  currencyTotals,
  evaluationSummary,
  thresholdFinding,
  currencyProvenance,
  hasChangedEvaluationInputs,
} from "../src/lib/presentation";
import type { Expense, Evaluation, Membership, RuleResult } from "../src/types";

const expense = (overrides: Partial<Expense> = {}) =>
  ({
    original_amount: 48,
    original_currency: "USD",
    confirmed_fields: {},
    ...overrides,
  }) as Expense;
const evaluation = (
  rules: Partial<RuleResult>[],
  overall: Evaluation["overall_outcome"] = "fail",
) =>
  ({
    overall_outcome: overall,
    rule_results: rules.map((r) => ({ details: {}, ...r })),
  }) as Evaluation;

test("Finance identity lookup uses auth user ID, not membership ID", () => {
  const member = {
    id: "membership-1",
    user_id: "employee-auth-id",
    display_name: "Alex",
  } as Membership;
  assert.equal(
    membershipLookup([member]).get("employee-auth-id")?.display_name,
    "Alex",
  );
  assert.equal(membershipLookup([member]).has("membership-1"), false);
});

test("Original currency totals stay separate and missing values are not zero", () => {
  const result = currencyTotals([
    expense(),
    expense({ original_currency: "EUR", original_amount: 12 }),
    expense({ original_currency: null }),
    expense({ original_amount: null }),
    expense({ original_amount: 0 }),
  ]);
  assert.deepEqual(result.totals, [
    ["EUR", 12],
    ["USD", 48],
  ]);
  assert.equal(result.missing, 2);
  assert.deepEqual(currencyTotals([]), { totals: [], missing: 0 });
});

test("Unknown findings are described as unresolved even when saved overall outcome is fail", () => {
  const summary = evaluationSummary(
    evaluation([{ outcome: "unknown", rule_type: "required_field" }]),
  );
  assert.match(summary.label, /clarification/);
  assert.doesNotMatch(summary.label, /violation|issue/);
  assert.match(summary.tone, /amber/);
});

test("Failed and unknown checks remain distinct in a mixed evaluation", () => {
  assert.equal(
    evaluationSummary(evaluation([{ outcome: "fail" }, { outcome: "unknown" }]))
      .label,
    "1 policy issue to review · 1 unresolved",
  );
});

test("Non-applicable approval thresholds never display executive escalation", () => {
  assert.equal(
    thresholdFinding(
      evaluation([
        {
          rule_type: "approval_threshold",
          outcome: "not_applicable",
          details: {},
        },
      ]),
    ),
    undefined,
  );
  assert.equal(
    thresholdFinding(
      evaluation([
        {
          rule_type: "approval_threshold",
          outcome: "pass",
          details: { threshold_triggered: false },
        },
      ]),
    ),
    undefined,
  );
  assert.ok(
    thresholdFinding(
      evaluation(
        [
          {
            rule_type: "approval_threshold",
            outcome: "pass",
            details: { threshold_triggered: true },
          },
        ],
        "needs_review",
      ),
    ),
  );
});

test("Inferred currency stays visibly unconfirmed until a person confirms it", () => {
  const inferred = expense({
    extraction_raw: { currency_is_inferred: true } as Expense["extraction_raw"],
  });
  assert.match(currencyProvenance(inferred), /inferred.*confirmation needed/);
  assert.match(
    currencyProvenance({
      ...inferred,
      confirmed_fields: {
        original_currency: {
          value: "USD",
          source: "extracted",
          updated_at: "",
          updated_by: null,
        },
      },
    }),
    /inferred/,
  );
  assert.equal(
    currencyProvenance({
      ...inferred,
      confirmed_fields: {
        original_currency: {
          value: "USD",
          source: "finance",
          updated_at: "",
          updated_by: null,
        },
      },
    }),
    "Currency confirmed by finance",
  );
});

test("An empty evaluation with fail outcome does not invent a confirmed violation", () => {
  assert.equal(
    evaluationSummary(evaluation([])).label,
    "Finance review required",
  );
});

test("Changed evaluation inputs are flagged without treating omitted snapshot fields as stale", () => {
  const record = {
    ...evaluation([]),
    inputs_snapshot: { original_amount: 48 },
  };
  assert.equal(hasChangedEvaluationInputs(record, expense()), false);
  assert.equal(
    hasChangedEvaluationInputs(record, expense({ original_amount: 49 })),
    true,
  );
  assert.equal(
    hasChangedEvaluationInputs({ ...record, inputs_snapshot: {} }, expense()),
    false,
  );
});
