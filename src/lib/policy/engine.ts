import { currencyConfirmed } from "@/lib/evidence";
export { currencyConfirmed } from "@/lib/evidence";
import Decimal from "decimal.js";
export { EVALUATOR_VERSION } from "./version";
import {
  evidenceReviewValid,
  uncertainEvidence,
} from "@/lib/receipts/verification";
import { detectPatterns } from "@/lib/receipts/patterns";
import type {
  Expense,
  PolicyRule,
  PolicyVersion,
  RuleResult,
  SpendingContext,
  DuplicateFinding,
  PolicyCondition,
} from "@/types";

export interface EvaluationInput {
  expense: Expense;
  activePolicyRules: PolicyRule[];
  applicablePolicy?: PolicyVersion | null;
  policyEffectiveDateChecked?: boolean;
  policyEffectiveFrom?: string | null;
  spendingHistory?: Expense[];
  candidateDuplicates?: Expense[];
}
export interface EngineResult {
  overall_outcome: "pass" | "fail" | "unknown" | "needs_review";
  rule_results: RuleResult[];
  reimbursable_amount: number | null;
  reimbursable_currency: string;
  spending_context: SpendingContext;
  duplicate_findings: DuplicateFinding[];
  requires_approval_threshold: boolean;
  notes: string[];
}
const ACTIVE = new Set([
  "submitted",
  "needs_review",
  "needs_information",
  "ready_for_approval",
  "approved",
]);
const TYPES = new Set([
  "minimum_amount",
  "submission_deadline",
  "required_field",
  "per_expense_cap",
  "daily_cap",
  "category_cap",
  "city_cap",
  "prohibited_item",
  "approval_threshold",
  "client_entertainment_requirement",
  "itemization_requirement",
  "currency_restriction",
]);
const FIELDS = new Set([
  "merchant",
  "expense_date",
  "original_amount",
  "original_currency",
  "category",
  "city",
  "trip_context",
  "business_purpose",
  "client_name",
  "attendee_count",
  "invoice_number",
]);
const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : v;
const present = (v: unknown) =>
  v !== null && v !== undefined && (typeof v !== "string" || v.trim() !== "");
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** A conversion is accepted only with a positive rate, dated source and agreeing values. */
export function comparableAmount(
  expense: Expense,
  currency: string,
): Decimal | null {
  if (
    !finite(expense.original_amount) ||
    expense.original_amount < 0 ||
    !currencyConfirmed(expense)
  )
    return null;
  if (
    expense.original_currency?.trim().toUpperCase() === currency.toUpperCase()
  )
    return new Decimal(expense.original_amount);
  if (
    expense.converted_currency?.trim().toUpperCase() !==
      currency.toUpperCase() ||
    !finite(expense.converted_amount) ||
    !finite(expense.exchange_rate) ||
    expense.exchange_rate <= 0 ||
    !expense.exchange_rate_date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expense.exchange_rate_date) ||
    !expense.exchange_rate_source?.trim()
  )
    return null;
  const expected = new Decimal(expense.original_amount).times(
    expense.exchange_rate,
  );
  return expected.minus(expense.converted_amount).abs().lte("0.01")
    ? new Decimal(expense.converted_amount)
    : null;
}

function condition(expense: Expense, c: PolicyCondition): boolean | null {
  if (!c || !FIELDS.has(c.field)) return null;
  const value =
    c.field === "invoice_number"
      ? (expense.confirmed_fields?.invoice_number?.value ??
        expense.extraction_raw?.invoice_number?.value)
      : expense[c.field as keyof Expense];
  if (c.operator === "present") return present(value);
  if (c.operator === "absent") return !present(value);
  if (!present(value)) return null;
  switch (c.operator) {
    case "eq":
      return norm(value) === norm(c.value);
    case "neq":
      return norm(value) !== norm(c.value);
    case "in":
      return Array.isArray(c.value)
        ? c.value.some((v) => norm(v) === norm(value))
        : null;
    case "not_in":
      return Array.isArray(c.value)
        ? !c.value.some((v) => norm(v) === norm(value))
        : null;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (!finite(value) || !finite(c.value)) return null;
      const comparison = new Decimal(value).cmp(c.value);
      return c.operator === "gt"
        ? comparison > 0
        : c.operator === "gte"
          ? comparison >= 0
          : c.operator === "lt"
            ? comparison < 0
            : comparison <= 0;
    }
    default:
      return null;
  }
}
export function ruleSupportIssue(rule: PolicyRule): string | null {
  if (!rule || !TYPES.has(rule.type))
    return "This rule type needs manual policy interpretation.";
  if (
    ![
      "block",
      "flag",
      "require_approval",
      "require_field",
      "info_only",
    ].includes(rule.outcome)
  )
    return "The rule outcome is not supported.";
  if (/per night|nightly/i.test(rule.supporting_text))
    return "Nightly limits need a verified night count, which this workspace does not yet capture.";
  if (
    /per attendee|per person/i.test(rule.supporting_text) &&
    rule.type === "per_expense_cap" &&
    !rule.limit_basis
  )
    return "Confirm the per-person limit basis explicitly.";
  if (!rule.id || !rule.source_clause || !rule.supporting_text)
    return "A rule must retain its identifier and source evidence.";
  if (rule.aggregation_scope === "per_trip")
    return "Trip-wide limits need a verified trip identifier, which this workspace does not yet capture.";
  if (
    !["per_expense", "daily", "monthly", null, undefined].includes(
      rule.aggregation_scope,
    )
  )
    return "This aggregation period is not supported.";
  if (
    rule.limit_basis &&
    !["per_claim", "per_attendee"].includes(rule.limit_basis)
  )
    return "This limit basis needs manual interpretation.";
  if (rule.spending_scope === "company")
    return "Company-wide shared budgets need manual review; personal allowances are evaluated per employee.";
  if (
    rule.spending_scope &&
    !["employee", "company"].includes(rule.spending_scope)
  )
    return "This spending scope needs manual interpretation.";
  if (
    [
      "minimum_amount",
      "per_expense_cap",
      "daily_cap",
      "category_cap",
      "city_cap",
      "approval_threshold",
    ].includes(rule.type) &&
    (!finite(rule.limit) ||
      rule.limit < 0 ||
      !/^[A-Z]{3}$/.test(rule.limit_currency ?? ""))
  )
    return "The financial limit or its ISO currency is missing.";
  if (
    rule.type === "submission_deadline" &&
    (!Number.isInteger(rule.deadline_days) ||
      rule.deadline_days! < 0 ||
      rule.deadline_days! > 3660 ||
      rule.deadline_basis !== "calendar_days")
  )
    return "A submission deadline needs an explicit non-negative calendar-day count. Business-day and month-end deadlines remain manual review.";
  if (
    rule.type === "minimum_amount" &&
    ((rule.aggregation_scope && rule.aggregation_scope !== "per_expense") ||
      rule.limit_basis === "per_attendee")
  )
    return "Minimum amounts are supported per claim only.";
  if (
    rule.type === "submission_deadline" &&
    /business\s*days|working\s*days|month[ -]?end|end of (?:the )?(?:month|trip)|local time|time\s*zone/i.test(
      rule.supporting_text ?? "",
    )
  )
    return "The source deadline uses a calendar convention not supported automatically. Finance must interpret the quoted clause.";
  if (
    !Array.isArray(rule.conditions ?? []) ||
    !Array.isArray(rule.exceptions ?? [])
  )
    return "Conditions or exceptions are malformed.";
  for (const c of [
    ...(rule.conditions ?? []),
    ...(rule.exceptions ?? []).map((e) => e.condition),
  ]) {
    if (
      !c ||
      !FIELDS.has(c.field) ||
      ![
        "eq",
        "neq",
        "in",
        "not_in",
        "gt",
        "gte",
        "lt",
        "lte",
        "present",
        "absent",
      ].includes(c.operator)
    )
      return "A condition uses an unsupported field or operator.";
    if (["in", "not_in"].includes(c.operator) && !Array.isArray(c.value))
      return "A list condition requires an explicit list.";
  }
  for (const exception of rule.exceptions ?? []) {
    if (!exception.override || !exception.note?.trim())
      return "An exception needs a documented override and explanation.";
    if (
      Object.keys(exception.override).some(
        (k) =>
          ![
            "limit",
            "limit_currency",
            "limit_basis",
            "required_field",
            "prohibited_values",
            "outcome",
          ].includes(k),
      )
    )
      return "This exception changes unsupported rule attributes.";
    if (
      "limit" in exception.override &&
      (!finite(exception.override.limit) || exception.override.limit < 0)
    )
      return "An exception contains an invalid monetary limit.";
  }
  // Legacy seeded rules sometimes encode two different limits in prose but only one in data.
  const amounts = new Set(
    (rule.supporting_text.match(/[$€£]\s*\d+(?:\.\d+)?/g) ?? []).map((v) =>
      v.replace(/\s/g, ""),
    ),
  );
  if (amounts.size > 1 && !rule.exceptions?.length)
    return "Multiple limits appear in this clause. Confirm explicit exceptions or separate rules before automatic evaluation.";
  return null;
}
function finding(
  rule: Pick<PolicyRule, "id" | "type" | "source_clause">,
  outcome: RuleResult["outcome"],
  message: string,
  details: Record<string, unknown> = {},
  action = "None",
  impact: number | null = null,
): RuleResult {
  return {
    rule_id: rule.id,
    rule_type: rule.type,
    source_clause: rule.source_clause,
    outcome,
    message,
    details,
    reimbursable_impact: impact,
    required_action: action,
  };
}
const core = (id: string) => ({
  id,
  type: "required_field" as const,
  source_clause: "Receipt evidence",
});
function period(date: string, scope: PolicyRule["aggregation_scope"]) {
  if (scope === "monthly") {
    const start = date.slice(0, 7) + "-01";
    const next = new Date(
      Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    return { start, end: next };
  }
  return { start: date, end: date };
}
function applicable(expense: Expense, rule: PolicyRule): boolean | null {
  for (const [list, value] of [
    [rule.categories, expense.category],
    [rule.trip_contexts, expense.trip_context],
    [rule.cities, expense.city],
  ] as const) {
    if (list?.length) {
      if (!present(value)) return null;
      if (!list.some((v) => norm(v) === norm(value))) return false;
    }
  }
  let unknown = false;
  for (const c of rule.conditions ?? []) {
    const matches = condition(expense, c);
    if (matches === false) return false;
    if (matches === null) unknown = true;
  }
  return unknown ? null : true;
}
function evaluateRule(
  expense: Expense,
  originalRule: PolicyRule,
  history: Expense[],
): RuleResult {
  const unsupported = ruleSupportIssue(originalRule);
  if (unsupported)
    return finding(
      originalRule,
      "unknown",
      unsupported,
      { supported: false },
      "Finance must confirm a supported interpretation of this clause",
    );
  let rule = { ...originalRule };
  const applies = applicable(expense, rule);
  if (applies === false)
    return finding(
      rule,
      "not_applicable",
      "This rule does not apply to this expense.",
    );
  if (applies === null)
    return finding(
      rule,
      "unknown",
      "More context is needed to determine whether this rule applies.",
      {},
      "Confirm the category, location and required context",
    );
  const matched = (rule.exceptions ?? []).map((e) => ({
    exception: e,
    matches: condition(expense, e.condition),
  }));
  if (matched.some((e) => e.matches === null))
    return finding(
      rule,
      "unknown",
      "An exception cannot be resolved with the available context.",
      {},
      "Provide the information required by the exception",
    );
  const overrides = matched.filter((e) => e.matches).map((e) => e.exception);
  const patch: Record<string, unknown> = {};
  for (const e of overrides)
    for (const [key, value] of Object.entries(e.override)) {
      if (key in patch && JSON.stringify(patch[key]) !== JSON.stringify(value))
        return finding(
          rule,
          "unknown",
          "Applicable exceptions conflict.",
          {},
          "Finance must resolve the policy interpretation",
        );
      patch[key] = value;
    }
  rule = { ...rule, ...patch };
  const supportAfterException = ruleSupportIssue({
    ...rule,
    exceptions: [],
    supporting_text: rule.supporting_text.replace(/[$€£]\s*\d+(?:\.\d+)?/g, ""),
  });
  if (supportAfterException)
    return finding(
      rule,
      "unknown",
      supportAfterException,
      {},
      "Review the exception configuration",
    );
  const details: Record<string, unknown> = {
    exception_notes: overrides.map((e) => e.note),
    configured_outcome: rule.outcome,
  };
  if (
    rule.type === "required_field" ||
    rule.type === "client_entertainment_requirement"
  ) {
    if (!rule.required_field || !FIELDS.has(rule.required_field))
      return finding(
        rule,
        "unknown",
        "The required field is not configured.",
        details,
        "Review this policy rule",
      );
    const v =
      rule.required_field === "invoice_number"
        ? (expense.confirmed_fields?.invoice_number?.value ??
          expense.extraction_raw?.invoice_number?.value)
        : expense[rule.required_field as keyof Expense];
    const okay =
      present(v) &&
      (rule.required_field !== "attendee_count" ||
        (finite(v) && Number.isInteger(v) && v >= 1));
    return finding(
      rule,
      okay ? "pass" : "unknown",
      okay
        ? "Required " + rule.required_field.replaceAll("_", " ") + " provided."
        : "Missing " + rule.required_field.replaceAll("_", " ") + ".",
      { ...details, missing_field: okay ? null : rule.required_field },
      okay ? "None" : "Provide " + rule.required_field.replaceAll("_", " "),
    );
  }
  if (rule.type === "itemization_requirement") {
    const ext = expense.extraction_raw;
    const complete =
      ext?.itemization_completeness === "complete" &&
      ext.line_items?.length > 0 &&
      ext.line_items.every((item) => finite(item.amount));
    return finding(
      rule,
      complete ? "pass" : "unknown",
      complete
        ? "Itemized evidence is available."
        : "An itemized receipt is required but is incomplete or unavailable.",
      details,
      complete ? "None" : "Provide complete itemized evidence",
    );
  }
  if (rule.type === "currency_restriction") {
    if (!currencyConfirmed(expense))
      return finding(
        rule,
        "unknown",
        "Currency needs explicit confirmation.",
        { non_overridable: true },
        "Confirm the ISO currency code",
      );
    const prohibited = rule.prohibited_values?.some(
      (c) => norm(c) === norm(expense.original_currency),
    );
    return finding(
      rule,
      prohibited ? "fail" : "pass",
      prohibited
        ? "This currency is excluded by company policy."
        : "Currency evidence satisfies this restriction.",
      details,
    );
  }
  if (rule.type === "prohibited_item") {
    const ext = expense.extraction_raw;
    if (
      !ext ||
      ext.itemization_completeness !== "complete" ||
      !ext.line_items?.length
    )
      return finding(
        rule,
        "unknown",
        "Item restrictions cannot be checked without complete receipt items.",
        details,
        "Provide an itemized receipt or obtain a documented finance exception",
      );
    const matchedItems = ext.line_items
      .map((item, source_index) => ({ ...item, source_index }))
      .filter((item) =>
        (rule.prohibited_values ?? []).some((term) =>
          item.description?.toLowerCase().includes(term.toLowerCase()),
        ),
      );
    if (matchedItems.some((item) => !finite(item.amount)))
      return finding(
        rule,
        "unknown",
        "A restricted item has no readable amount.",
        details,
        "Confirm the restricted item amount",
      );
    const deduction = matchedItems.reduce(
      (sum, item) => sum.plus(item.amount!),
      new Decimal(0),
    );
    return finding(
      rule,
      matchedItems.length ? "fail" : "pass",
      matchedItems.length
        ? "Prohibited items detected on receipt: " +
            matchedItems.map((i) => i.description).join(", ") +
            "."
        : "No prohibited items identified in the complete receipt items.",
      {
        ...details,
        prohibited_items: matchedItems,
        prohibited_sum: deduction.toNumber(),
        adjusted_reimbursable: finite(expense.original_amount)
          ? Decimal.max(
              0,
              new Decimal(expense.original_amount).minus(deduction),
            ).toNumber()
          : null,
      },
      matchedItems.length ? "Finance must confirm the deduction" : "None",
      null,
    );
  }
  if (rule.type === "submission_deadline") {
    const submitted = expense.first_submitted_at;
    if (
      !expense.expense_date ||
      !submitted ||
      Number.isNaN(Date.parse(submitted))
    )
      return finding(
        rule,
        "unknown",
        "The expense date or recorded first submission time is unavailable.",
        details,
        "Supply a valid expense date; finance must review legacy claims without submission history",
      );
    const date = Date.parse(expense.expense_date + "T00:00:00Z");
    const submittedDay = Date.parse(
      new Date(submitted).toISOString().slice(0, 10) + "T00:00:00Z",
    );
    const elapsed = (submittedDay - date) / 86400000;
    if (!Number.isFinite(elapsed) || elapsed < 0)
      return finding(
        rule,
        "unknown",
        "The expense date is after its first submission date.",
        details,
        "Correct the date or request clarification",
      );
    const late = elapsed > rule.deadline_days!;
    return finding(
      rule,
      late ? "fail" : "pass",
      late
        ? "Claim submitted after the policy deadline."
        : "Claim submitted within the policy deadline.",
      {
        ...details,
        first_submitted_at: submitted,
        elapsed_calendar_days: elapsed,
        deadline_days: rule.deadline_days,
        basis:
          "UTC calendar days; first submission is retained on resubmission",
      },
      late ? "Finance must review the late-submission exception" : "None",
      late ? 0 : null,
    );
  }
  const comparisonCurrency = rule.limit_currency!;
  const current = comparableAmount(expense, comparisonCurrency);
  if (!current)
    return finding(
      rule,
      "unknown",
      "A confirmed currency and documented conversion are required to compare this claim with the policy limit.",
      {
        ...details,
        comparison_currency: comparisonCurrency,
        non_overridable: true,
      },
      "Confirm currency or provide a dated conversion with its source",
    );
  let limit = new Decimal(rule.limit!);
  if (rule.type === "minimum_amount") {
    const below = current.lt(limit);
    return finding(
      rule,
      below ? "fail" : "pass",
      below
        ? "Claim is below the policy minimum reimbursement amount."
        : "Claim meets the policy minimum reimbursement amount.",
      {
        ...details,
        limit: limit.toNumber(),
        amount: current.toNumber(),
        currency: comparisonCurrency,
      },
      below
        ? "Review the source policy minimum or request a documented exception"
        : "None",
      below ? 0 : null,
    );
  }
  if (rule.limit_basis === "per_attendee") {
    if (
      !expense.attendee_count ||
      !Number.isInteger(expense.attendee_count) ||
      expense.attendee_count < 1
    )
      return finding(
        rule,
        "unknown",
        "Attendee count is needed for the per-person allowance.",
        details,
        "Provide the attendee count",
      );
    limit = limit.times(expense.attendee_count);
  }
  if (rule.type === "approval_threshold") {
    const triggered = current.gt(limit);
    return finding(
      rule,
      "pass",
      triggered
        ? "Executive approval threshold reached."
        : "Amount is below the executive approval threshold.",
      {
        ...details,
        threshold_triggered: triggered,
        threshold: limit.toNumber(),
        amount: current.toNumber(),
        currency: comparisonCurrency,
      },
      triggered ? "Executive review and documented sign-off required" : "None",
    );
  }
  const scope =
    rule.aggregation_scope ??
    (rule.type === "daily_cap" ? "daily" : "per_expense");
  if (scope === "per_expense") {
    const exceeds = current.gt(limit);
    // Reimbursable amount remains in the receipt currency.
    const impact = exceeds
      ? limit
          .times(expense.original_amount!)
          .div(current)
          .toDecimalPlaces(4)
          .toNumber()
      : null;
    return finding(
      rule,
      exceeds ? "fail" : "pass",
      exceeds
        ? "Amount exceeds the per-expense limit."
        : "Amount is within the per-expense limit.",
      {
        ...details,
        amount: current.toNumber(),
        limit: limit.toNumber(),
        currency: comparisonCurrency,
        calculation:
          current.toFixed(2) +
          " compared with " +
          limit.toFixed(2) +
          " " +
          comparisonCurrency,
      },
      exceeds ? "Finance must review excess spend" : "None",
      impact,
    );
  }
  if (!expense.expense_date)
    return finding(
      rule,
      "unknown",
      "The expense date is needed for this allowance.",
      details,
      "Confirm the transaction date",
    );
  const window = period(expense.expense_date, scope);
  const contributors = history.filter(
    (h) =>
      h.id !== expense.id &&
      h.company_id === expense.company_id &&
      (rule.spending_scope === "company" ||
        h.employee_id === expense.employee_id) &&
      ACTIVE.has(h.review_status) &&
      h.expense_date &&
      h.expense_date >= window.start &&
      h.expense_date <= window.end &&
      (rule.categories?.length
        ? rule.categories.some((c) => norm(c) === norm(h.category))
        : norm(h.category) === norm(expense.category)) &&
      (rule.trip_contexts?.length
        ? rule.trip_contexts.includes(h.trip_context!)
        : true),
  );
  const unresolved = contributors.filter(
    (h) => !comparableAmount(h, comparisonCurrency),
  );
  if (unresolved.length)
    return finding(
      rule,
      "unknown",
      "Some contributing receipts have unresolved amounts, currencies or conversions.",
      {
        ...details,
        expense_ids_included: contributors.map((h) => h.id),
        unresolved_expense_ids: unresolved.map((h) => h.id),
        comparison_currency: comparisonCurrency,
        period_start: window.start,
        period_end: window.end,
        non_overridable: true,
      },
      "Resolve currency and conversion evidence on the contributing receipts",
    );
  const prior = contributors.reduce(
    (sum, h) => sum.plus(comparableAmount(h, comparisonCurrency)!),
    new Decimal(0),
  );
  const total = prior.plus(current);
  const exceeds = total.gt(limit);
  const remaining = Decimal.max(0, limit.minus(prior));
  const impact = exceeds
    ? remaining
        .times(expense.original_amount!)
        .div(current.isZero() ? 1 : current)
        .toDecimalPlaces(4)
        .toNumber()
    : null;
  return finding(
    rule,
    exceeds ? "fail" : "pass",
    (scope === "monthly" ? "Monthly" : "Daily") +
      " category spending " +
      total.toFixed(2) +
      " " +
      comparisonCurrency +
      (exceeds ? " exceeds" : " is within") +
      " the " +
      limit.toFixed(2) +
      " allowance.",
    {
      ...details,
      prior_total: prior.toNumber(),
      combined_total: total.toNumber(),
      daily_limit: scope === "daily" ? limit.toNumber() : null,
      limit: limit.toNumber(),
      currency: comparisonCurrency,
      period_start: window.start,
      period_end: window.end,
      expense_ids_included: contributors.map((h) => h.id),
      contributions: contributors.map((h) => ({
        id: h.id,
        merchant: h.merchant,
        amount: comparableAmount(h, comparisonCurrency)!.toNumber(),
        original_amount: h.original_amount,
        original_currency: h.original_currency,
        exchange_rate: h.exchange_rate,
        exchange_rate_date: h.exchange_rate_date,
        exchange_rate_source: h.exchange_rate_source,
      })),
      calculation:
        prior.toFixed(2) +
        " prior + " +
        current.toFixed(2) +
        " current = " +
        total.toFixed(2) +
        " " +
        comparisonCurrency,
      is_tier_1_city: overrides.length > 0,
    },
    exceeds ? "Finance must review excess spend" : "None",
    impact,
  );
}
export function evaluateExpensePolicy(input: EvaluationInput): EngineResult {
  const { expense } = input;
  const results: RuleResult[] = [];
  const uncertain = uncertainEvidence(expense);
  if (uncertain.length)
    results.push(
      finding(
        core("critical_evidence_verification"),
        "unknown",
        "Critical receipt evidence must be compared with the original.",
        { reasons: uncertain, non_overridable: !evidenceReviewValid(expense) },
        "Review and explicitly confirm the amount, date, merchant and currency",
      ),
    );
  if (uncertain.length && evidenceReviewValid(expense)) {
    const check = results.at(-1)!;
    check.outcome = "pass";
    check.message =
      "A person compared the current critical values against the current receipt evidence.";
    check.required_action = "None";
  }
  const patterns = detectPatterns(
    expense,
    input.candidateDuplicates ?? input.spendingHistory ?? [],
    input.activePolicyRules,
  );
  for (const [index, signal] of patterns.entries())
    results.push(
      finding(
        core("pattern_" + signal.kind + "_" + index),
        "unknown",
        signal.message,
        {
          ...signal.details,
          pattern_kind: signal.kind,
          related_expense_ids: signal.expense_ids,
          supported: true,
        },
        "Finance must compare these related claims and document a decision; this is not a fraud finding",
      ),
    );
  const currency = expense.original_currency?.trim().toUpperCase() ?? "";
  const amount =
    finite(expense.original_amount) && expense.original_amount >= 0
      ? new Decimal(expense.original_amount)
      : null;
  const goodCurrency = currencyConfirmed(expense);
  results.push(
    finding(
      core("data_amount_required"),
      amount && goodCurrency ? "pass" : "unknown",
      amount && goodCurrency
        ? "Amount and currency evidence are available."
        : "Amount or currency remains unconfirmed.",
      {
        non_overridable: !(amount && goodCurrency),
        amount: expense.original_amount,
        currency: currency || null,
      },
      amount && goodCurrency
        ? "None"
        : "Explicitly confirm amount and ISO currency",
    ),
  );
  const validDate = Boolean(
    expense.expense_date &&
    /^\d{4}-\d{2}-\d{2}$/.test(expense.expense_date) &&
    !Number.isNaN(Date.parse(expense.expense_date)) &&
    new Date(expense.expense_date).toISOString().slice(0, 10) ===
      expense.expense_date,
  );
  results.push(
    finding(
      core("data_date_required"),
      validDate ? "pass" : "unknown",
      validDate
        ? "Transaction date available."
        : "Transaction date is missing or invalid.",
      {},
      validDate ? "None" : "Provide a valid transaction date",
    ),
  );
  if (!expense.merchant?.trim())
    results.push(
      finding(
        core("data_merchant_required"),
        "unknown",
        "Merchant is missing.",
        {},
        "Provide the merchant name",
      ),
    );
  const policy = input.applicablePolicy;
  if (
    (input.policyEffectiveDateChecked && !policy) ||
    (input.policyEffectiveFrom &&
      expense.expense_date &&
      expense.expense_date < input.policyEffectiveFrom) ||
    (policy &&
      expense.expense_date &&
      ((policy.effective_from &&
        expense.expense_date < policy.effective_from) ||
        (policy.effective_to && expense.expense_date > policy.effective_to)))
  ) {
    results.push(
      finding(
        core("policy_effective_date_check"),
        "unknown",
        "No confirmed policy covers this transaction date.",
        { expense_date: expense.expense_date },
        "Finance must identify the applicable policy or document an exception",
      ),
    );
  }
  if (!input.activePolicyRules.length)
    results.push(
      finding(
        core("policy_rules_unavailable"),
        "unknown",
        "No automatically evaluable policy rules are available.",
        {},
        "Finance must review the source policy",
      ),
    );
  for (const clause of policy?.unsupported_clauses ?? [])
    results.push(
      finding(
        {
          ...core("unsupported_" + clause.clause_id),
          source_clause: clause.clause_id,
        },
        "unknown",
        clause.reason,
        { source_text: clause.source_text, supported: false },
        "Finance must interpret this clause and document its applicability",
      ),
    );
  const arithmetic = expense.extraction_raw?.arithmetic_check;
  if (arithmetic) {
    const known =
      finite(arithmetic.discrepancy) &&
      finite(arithmetic.calculated_total) &&
      finite(arithmetic.printed_total);
    results.push(
      finding(
        core("integrity_arithmetic_check"),
        known
          ? Math.abs(arithmetic.discrepancy!) > 0.02
            ? "fail"
            : "pass"
          : "unknown",
        known
          ? Math.abs(arithmetic.discrepancy!) > 0.02
            ? "Arithmetic inconsistency: " + arithmetic.note
            : "Arithmetic check passed: " + arithmetic.note
          : "Receipt arithmetic could not be verified from the available evidence.",
        { ...arithmetic },
        known && Math.abs(arithmetic.discrepancy!) <= 0.02
          ? "None"
          : "Review the arithmetic evidence and provide the missing detail",
      ),
    );
  }
  const duplicateFindings = checkDuplicates(
    expense,
    input.candidateDuplicates ?? [],
  );
  const exact = duplicateFindings.some((d) => d.type === "exact_hash");
  results.push(
    finding(
      core("integrity_duplicate_check"),
      exact ? "fail" : duplicateFindings.length ? "unknown" : "pass",
      exact
        ? "Exact duplicate receipt detected."
        : duplicateFindings.length
          ? "Potential duplicate receipt needs review."
          : "No duplicate match found among the available company receipts.",
      { findings: duplicateFindings },
      duplicateFindings.length
        ? "Finance must review the matching receipt evidence"
        : "None",
      exact ? 0 : null,
    ),
  );
  for (const rule of input.activePolicyRules) {
    const result = evaluateRule(expense, rule, input.spendingHistory ?? []);
    const outcome = result.details.configured_outcome ?? rule.outcome;
    if (
      result.outcome === "fail" &&
      ["flag", "require_approval", "info_only"].includes(String(outcome))
    ) {
      result.outcome = "pass";
      result.details.threshold_triggered = outcome !== "info_only";
      result.reimbursable_impact = null;
      result.message =
        (outcome === "info_only" ? "Information: " : "Finance review: ") +
        result.message;
    }
    results.push(result);
  }
  let reimbursable = amount;
  const prohibited = new Map<string, number>();
  for (const result of results) {
    if (result.reimbursable_impact !== null && reimbursable)
      reimbursable = Decimal.min(reimbursable, result.reimbursable_impact);
    const items = result.details.prohibited_items as
      | {
          description: string | null;
          amount: number | null;
          source_index: number;
        }[]
      | undefined;
    for (const item of result.outcome === "fail" ? (items ?? []) : [])
      if (finite(item.amount))
        prohibited.set(String(item.source_index), item.amount);
  }
  if (reimbursable && amount && prohibited.size)
    reimbursable = Decimal.min(
      reimbursable,
      Decimal.max(
        0,
        amount.minus(
          [...prohibited.values()].reduce(
            (sum, v) => sum.plus(v),
            new Decimal(0),
          ),
        ),
      ),
    );
  const unknown = results.some((r) => r.outcome === "unknown");
  const fail = results.some((r) => r.outcome === "fail");
  const approval = results.some((r) => r.details.threshold_triggered === true);
  const context = results.find((r) => r.details.period_start)?.details;
  return {
    overall_outcome: fail
      ? "fail"
      : unknown
        ? "unknown"
        : approval
          ? "needs_review"
          : "pass",
    rule_results: results,
    reimbursable_amount: unknown ? null : (reimbursable?.toNumber() ?? null),
    reimbursable_currency: currency,
    spending_context: {
      employee_id: expense.employee_id,
      period_start: String(context?.period_start ?? expense.expense_date ?? ""),
      period_end: String(context?.period_end ?? expense.expense_date ?? ""),
      category: expense.category,
      city: expense.city,
      trip_context: expense.trip_context,
      prior_total: Number(context?.prior_total ?? 0),
      currency: String(context?.currency ?? currency),
      expense_ids_included: (context?.expense_ids_included as string[]) ?? [],
    },
    duplicate_findings: duplicateFindings,
    requires_approval_threshold: approval,
    notes: [],
  };
}

/** Company-wide evidence check, deliberately separate from allowance history. */
export function checkDuplicates(
  target: Expense,
  history: Expense[],
): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];
  for (const candidate of history) {
    if (
      candidate.id === target.id ||
      candidate.company_id !== target.company_id ||
      candidate.review_status === "rejected"
    )
      continue;
    const crossEmployee = Boolean(
      target.employee_id &&
      candidate.employee_id &&
      target.employee_id !== candidate.employee_id,
    );
    const exact = Boolean(
      target.receipt_file_hash &&
      candidate.receipt_file_hash === target.receipt_file_hash,
    );
    const merchant = (s: string | null) =>
      s?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    const a = merchant(target.merchant),
      b = merchant(candidate.merchant);
    const probable =
      finite(target.original_amount) &&
      finite(candidate.original_amount) &&
      new Decimal(target.original_amount)
        .minus(candidate.original_amount)
        .abs()
        .lt(".01") &&
      target.original_currency?.toUpperCase() ===
        candidate.original_currency?.toUpperCase() &&
      Boolean(target.original_currency) &&
      Boolean(target.expense_date) &&
      target.expense_date === candidate.expense_date &&
      Boolean(a && b) &&
      (a.includes(b) || b.includes(a));
    if (exact || probable)
      findings.push({
        type: exact ? "exact_hash" : "probable",
        matched_expense_id: candidate.id,
        matched_expense_date: crossEmployee ? null : candidate.expense_date,
        matched_merchant: crossEmployee ? null : candidate.merchant,
        matched_amount: crossEmployee ? null : candidate.original_amount,
        matching_fields: exact
          ? ["receipt_file_hash"]
          : ["merchant", "date", "amount", "currency"],
        differing_fields:
          target.employee_id === candidate.employee_id ? [] : ["employee_id"],
        note: crossEmployee
          ? "Possible match to a company receipt submitted by another employee. Finance can inspect the source evidence."
          : exact
            ? "Matching original receipt file."
            : "Merchant, date, amount and currency match.",
      });
  }
  return findings;
}
