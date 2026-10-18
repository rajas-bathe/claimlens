"use client";

import type { Evaluation, Expense, RuleResult } from "@/types";
import { formatDateTime, formatCurrency, cn } from "@/lib/utils";
import {
  evaluationSummary,
  hasChangedEvaluationInputs,
} from "@/lib/presentation";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  MinusCircle,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const outcomes = {
  pass: { icon: CheckCircle2, color: "text-emerald-700", label: "Passed" },
  fail: { icon: XCircle, color: "text-rose-700", label: "Issue found" },
  unknown: { icon: HelpCircle, color: "text-amber-700", label: "Unresolved" },
  not_applicable: {
    icon: MinusCircle,
    color: "text-gray-500",
    label: "Not applicable",
  },
};
function RuleFinding({ result }: { result: RuleResult }) {
  const config = outcomes[result.outcome] ?? outcomes.unknown;
  const Icon = config.icon;
  return (
    <div className="rule-row">
      {Array.isArray(result.details?.contributions) && (
        <details className="allowance-evidence">
          <summary>
            {result.details.contributions.length} receipts contribute to this
            allowance
          </summary>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Original</th>
                  <th>Compared amount</th>
                  <th>Conversion source</th>
                </tr>
              </thead>
              <tbody>
                {(
                  result.details.contributions as {
                    id: string;
                    merchant: string | null;
                    amount: number;
                    original_amount: number;
                    original_currency: string;
                    exchange_rate_source: string | null;
                    exchange_rate_date: string | null;
                  }[]
                ).map((item) => (
                  <tr key={item.id}>
                    <td>{item.merchant || "Merchant unavailable"}</td>
                    <td>
                      {formatCurrency(
                        item.original_amount,
                        item.original_currency,
                      )}
                    </td>
                    <td>
                      {formatCurrency(
                        item.amount,
                        String(result.details.currency),
                      )}
                    </td>
                    <td>
                      {item.original_currency === result.details.currency
                        ? "Same currency"
                        : (item.exchange_rate_source || "Unavailable") +
                          " · " +
                          (item.exchange_rate_date || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Period: {String(result.details.period_start)} –{" "}
            {String(result.details.period_end)}. This receipt is added once;
            unrelated employees are excluded.
          </p>
        </details>
      )}
      <div className="rule-header">
        <Icon size={16} className={config.color} />
        <p>{result.message}</p>
        <span className={config.color}>{config.label}</span>
      </div>
      {result.required_action && result.required_action !== "None" && (
        <p className="rule-action">
          <strong>Next step:</strong> {result.required_action}
        </p>
      )}
      {result.source_clause ||
      result.details?.relevant_inputs ||
      result.details?.calculation ? (
        <details className="rule-details">
          <summary>Evidence & calculation</summary>
          {result.source_clause && (
            <p>Policy reference: {result.source_clause}</p>
          )}
          {Boolean(result.details?.relevant_inputs) && (
            <p>Inputs: {String(result.details.relevant_inputs)}</p>
          )}
          {Boolean(result.details?.calculation) && (
            <p>Calculation: {String(result.details.calculation)}</p>
          )}
        </details>
      ) : null}
    </div>
  );
}
export function EvaluationPanel({
  evaluation,
  expense,
  canReevaluate = false,
}: {
  evaluation: Evaluation | null;
  expense?: Expense;
  canReevaluate?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [evalError, setEvalError] = useState<string | null>(null);
  function handleRunEvaluation() {
    if (!expense) return;
    setEvalError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/expenses/" + expense.id + "/evaluate", {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Evaluation failed");
        router.refresh();
      } catch (err) {
        setEvalError(err instanceof Error ? err.message : "Evaluation failed");
      }
    });
  }
  const summary = evaluation ? evaluationSummary(evaluation) : null;
  const attention =
    evaluation?.rule_results.filter(
      (r) =>
        r.outcome === "fail" ||
        r.outcome === "unknown" ||
        (r.required_action && r.required_action !== "None"),
    ) ?? [];
  const other =
    evaluation?.rule_results.filter((r) => !attention.includes(r)) ?? [];
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">
            Policy findings
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {evaluation
              ? "Checked " + formatDateTime(evaluation.evaluated_at)
              : "Clear evidence before the next decision."}
          </p>
        </div>
        {canReevaluate && expense && (
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isPending}
            className="p-2 text-gray-500 rounded hover:bg-gray-100 disabled:opacity-50"
            aria-label="Run policy checks again"
            title="Run policy checks again"
          >
            <RefreshCw size={16} className={isPending ? "animate-spin" : ""} />
          </button>
        )}
      </div>
      <div className="p-5">
        {evaluation && evaluation.evaluator_version !== "3.0.0" && (
          <p className="workflow-hint mb-4">
            These findings were recorded before the current financial
            safeguards. Run policy checks again before making a new decision.
            Historical decisions have not been rewritten.
          </p>
        )}
        {evaluation &&
          expense &&
          hasChangedEvaluationInputs(evaluation, expense) && (
            <p
              role="status"
              className="evaluation-result bg-amber-50 border-amber-200 text-amber-800 mb-4"
            >
              Expense details have changed since these checks. Run policy checks
              again to review the current information.
            </p>
          )}
        {evaluation?.overall_outcome === "fail" &&
          !evaluation.rule_results.some((r) => r.outcome === "fail") && (
            <p className="text-xs text-amber-800 mb-4 leading-relaxed">
              The saved summary reports a failure, but its individual checks do
              not confirm a violation. Review the unresolved findings before
              deciding.
            </p>
          )}
        {!evaluation ? (
          <div className="space-y-4">
            {expense?.review_status === "approved" ? (
              <div className="evaluation-result bg-amber-50 border-amber-200 text-amber-800">
                <ShieldAlert size={19} className="mb-2" />
                <strong>Approved without recorded checks</strong>
                <p>
                  This historical approval has no saved policy evaluation. Its
                  approval history is preserved; compliance has not been
                  established.
                </p>
              </div>
            ) : (
              <div className="empty-message">
                <Clock size={25} />
                No recorded policy checks yet.
                <br />
                Submit the expense to start review.
              </div>
            )}
            {canReevaluate && expense && (
              <button
                type="button"
                className="button button-small"
                disabled={isPending}
                onClick={handleRunEvaluation}
              >
                {isPending && <Loader2 size={15} className="animate-spin" />}Run
                policy checks
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={cn("evaluation-result", summary!.tone)}>
              <strong>{summary!.label}</strong>
              <p>
                {evaluation.reimbursable_amount !== null &&
                evaluation.reimbursable_currency
                  ? "Calculated reimbursable: " +
                    formatCurrency(
                      evaluation.reimbursable_amount,
                      evaluation.reimbursable_currency,
                    ) +
                    " " +
                    evaluation.reimbursable_currency
                  : "Reimbursement amount or currency remains unresolved."}
              </p>
            </div>
            {attention.map((r, i) => (
              <RuleFinding key={r.rule_id + i} result={r} />
            ))}
            {evaluation.duplicate_findings?.length > 0 && (
              <div className="evaluation-result bg-rose-50 border-rose-200 text-rose-800 mt-4">
                <strong>
                  Potential duplicate receipts ·{" "}
                  {evaluation.duplicate_findings.length}
                </strong>
                {evaluation.duplicate_findings.map((d, i) => (
                  <p key={i}>
                    {d.type === "exact_hash"
                      ? "Matching receipt file"
                      : "Possible match"}
                    : {d.note}
                  </p>
                ))}
              </div>
            )}
            {other.length > 0 && (
              <details className="checks-details">
                <summary>
                  {other.length} passed or non-applicable checks
                </summary>
                {other.map((r, i) => (
                  <RuleFinding key={r.rule_id + i} result={r} />
                ))}
              </details>
            )}
            <details className="checks-details">
              <summary>Evaluation record</summary>
              <p className="text-xs text-gray-500 leading-relaxed">
                Checked {formatDateTime(evaluation.evaluated_at)} · Evaluator{" "}
                {evaluation.evaluator_version}
                <br />
                Recorded outcome: {evaluation.overall_outcome}
                <br />
                Record {evaluation.id}
              </p>
            </details>
          </>
        )}
        {evalError && (
          <p role="alert" className="text-xs text-rose-700 mt-4">
            {evalError}
          </p>
        )}
      </div>
    </section>
  );
}
