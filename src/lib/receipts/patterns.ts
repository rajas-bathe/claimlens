import Decimal from "decimal.js";
import type { Expense, PolicyRule } from "@/types";
import { currencyConfirmed } from "@/lib/evidence";
export interface PatternSignal {
  kind: "repeated_invoice" | "possible_split" | "near_threshold";
  message: string;
  expense_ids: string[];
  details: Record<string, unknown>;
}
const normalize = (s: string | null | undefined) =>
  s?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
const invoice = (e: Expense) =>
  normalize(
    String(
      e.confirmed_fields?.invoice_number?.value ??
        e.extraction_raw?.invoice_number?.value ??
        "",
    ),
  );
export function detectPatterns(
  target: Expense,
  history: Expense[],
  rules: PolicyRule[],
): PatternSignal[] {
  const relevant = history.filter(
    (e) =>
      e.id !== target.id &&
      e.company_id === target.company_id &&
      !["draft", "rejected"].includes(e.review_status),
  );
  const signals: PatternSignal[] = [];
  const repeated = invoice(target)
    ? relevant.filter(
        (e) =>
          invoice(e) === invoice(target) &&
          normalize(e.merchant) === normalize(target.merchant) &&
          normalize(target.merchant),
      )
    : [];
  if (repeated.length)
    signals.push({
      kind: "repeated_invoice",
      message:
        "This merchant and invoice number also appear on other submitted claims. Compare the originals; invoice numbers can legitimately repeat.",
      expense_ids: repeated.map((e) => e.id),
      details: {
        invoice_number:
          target.confirmed_fields?.invoice_number?.value ??
          target.extraction_raw?.invoice_number?.value,
        match_scope: "company",
      },
    });
  if (
    !target.expense_date ||
    !normalize(target.merchant) ||
    !currencyConfirmed(target) ||
    typeof target.original_amount !== "number" ||
    target.original_amount < 0
  )
    return signals;
  const peers = relevant.filter(
    (e) =>
      e.employee_id === target.employee_id &&
      e.expense_date === target.expense_date &&
      normalize(e.merchant) === normalize(target.merchant) &&
      e.category === target.category &&
      e.trip_context === target.trip_context &&
      e.original_currency === target.original_currency &&
      currencyConfirmed(e) &&
      typeof e.original_amount === "number" &&
      e.original_amount >= 0,
  );
  for (const rule of rules) {
    // Restrict the heuristic to unambiguous per-claim rules. No guessed daily or converted thresholds.
    if (
      !["approval_threshold", "per_expense_cap"].includes(rule.type) ||
      !rule.limit ||
      rule.limit < 0 ||
      rule.limit_basis === "per_attendee" ||
      rule.limit_currency !== target.original_currency ||
      rule.conditions?.length ||
      rule.exceptions?.length ||
      (rule.aggregation_scope && rule.aggregation_scope !== "per_expense")
    )
      continue;
    if (
      rule.categories?.length &&
      !rule.categories.includes(target.category ?? "")
    )
      continue;
    if (
      rule.trip_contexts?.length &&
      !rule.trip_contexts.includes(target.trip_context!)
    )
      continue;
    if (rule.cities?.length && !rule.cities.includes(target.city ?? ""))
      continue;
    const current = new Decimal(target.original_amount),
      limit = new Decimal(rule.limit);
    const under = peers.filter((e) =>
      new Decimal(e.original_amount!).lte(limit),
    );
    const total = under.reduce(
      (sum, e) => sum.plus(e.original_amount!),
      current,
    );
    if (current.lte(limit) && under.length && total.gt(limit))
      signals.push({
        kind: "possible_split",
        message:
          "Related same-day claims at the same merchant are individually below a per-claim threshold but together exceed it. Review whether these are separate purchases or a split bill.",
        expense_ids: under.map((e) => e.id),
        details: {
          rule_id: rule.id,
          source_clause: rule.source_clause,
          limit: rule.limit,
          currency: rule.limit_currency,
          combined_amount: total.toNumber(),
          scope: "same employee, merchant, expense date, category and context",
          intent_established: false,
        },
      });
    if (current.gte(limit.times(".9")) && current.lte(limit)) {
      const day = Date.parse(target.expense_date + "T00:00:00Z");
      const near = relevant.filter(
        (e) =>
          e.employee_id === target.employee_id &&
          normalize(e.merchant) === normalize(target.merchant) &&
          e.category === target.category &&
          e.trip_context === target.trip_context &&
          e.original_currency === target.original_currency &&
          currencyConfirmed(e) &&
          typeof e.original_amount === "number" &&
          new Decimal(e.original_amount).gte(limit.times(".9")) &&
          new Decimal(e.original_amount).lte(limit) &&
          !!e.expense_date &&
          Date.parse(e.expense_date + "T00:00:00Z") <= day &&
          Date.parse(e.expense_date + "T00:00:00Z") >= day - 29 * 86400000,
      );
      if (near.length >= 2)
        signals.push({
          kind: "near_threshold",
          message:
            "Several related claims in the last 30 calendar days sit within 10% of this policy threshold. This review signal does not establish misuse.",
          expense_ids: near.map((e) => e.id),
          details: {
            rule_id: rule.id,
            limit: rule.limit,
            currency: rule.limit_currency,
            heuristic_band: "90–100%",
            window_days: 30,
            intent_established: false,
          },
        });
    }
  }
  return signals;
}
