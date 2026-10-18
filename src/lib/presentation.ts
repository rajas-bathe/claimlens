import type { Evaluation, Expense, Membership } from "@/types";

/** Display-only helpers. These never decide eligibility or mutate claim data. */
export function membershipLookup(members: Membership[]) {
  return new Map(members.map((member) => [member.user_id, member]));
}

export function currencyTotals(expenses: Expense[]) {
  const totals = new Map<string, number>();
  let missing = 0;
  for (const expense of expenses) {
    if (expense.original_amount == null || !expense.original_currency) {
      missing++;
      continue;
    }
    const currency = expense.original_currency.toUpperCase();
    totals.set(
      currency,
      (totals.get(currency) ?? 0) + Number(expense.original_amount),
    );
  }
  return {
    totals: [...totals].sort(([a], [b]) => a.localeCompare(b)),
    missing,
  };
}

export function evaluationSummary(evaluation: Evaluation) {
  const failed = evaluation.rule_results.filter(
    (rule) => rule.outcome === "fail",
  ).length;
  const unknown = evaluation.rule_results.filter(
    (rule) => rule.outcome === "unknown",
  ).length;
  if (failed)
    return {
      label: `${failed} policy ${failed === 1 ? "issue" : "issues"} to review${unknown ? ` · ${unknown} unresolved` : ""}`,
      tone: "bg-rose-50 border-rose-200 text-rose-800",
    };
  if (unknown)
    return {
      label: `${unknown} ${unknown === 1 ? "check needs" : "checks need"} clarification`,
      tone: "bg-amber-50 border-amber-200 text-amber-800",
    };
  if (evaluation.overall_outcome === "pass")
    return {
      label: "Policy checks passed",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
    };
  return {
    label: "Finance review required",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
  };
}

export function thresholdFinding(evaluation: Evaluation) {
  return evaluation.rule_results.find(
    (rule) =>
      rule.rule_type === "approval_threshold" &&
      rule.details?.threshold_triggered === true,
  );
}

export function currencyProvenance(expense: Expense) {
  const field = expense.confirmed_fields?.original_currency;
  if (field && field.source !== "extracted")
    return `Currency confirmed by ${field.source === "manual" ? "manual entry" : field.source}`;
  if (expense.extraction_raw?.currency_is_inferred)
    return "Currency inferred from receipt · confirmation needed";
  if (!expense.original_currency) return "Currency not available";
  return "Currency read from receipt";
}

/** Only compare fields actually captured by this evaluation version. */
export function hasChangedEvaluationInputs(
  evaluation: Evaluation,
  expense: Expense,
) {
  const snapshot = evaluation.inputs_snapshot ?? {};
  const fields = [
    "merchant",
    "expense_date",
    "original_amount",
    "original_currency",
    "category",
    "city",
    "trip_context",
    "client_name",
    "attendee_count",
    "business_purpose",
    "converted_amount",
    "converted_currency",
    "exchange_rate",
    "exchange_rate_date",
    "exchange_rate_source",
  ] as const;
  return fields.some(
    (field) => field in snapshot && snapshot[field] !== expense[field],
  );
}
