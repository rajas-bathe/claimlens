'use client';

import type { Evaluation, Expense, RuleResult } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { CheckCircle2, XCircle, HelpCircle, MinusCircle, AlertTriangle, RefreshCw, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const OUTCOME_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', label: 'Fail' },
  unknown: { icon: HelpCircle, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Unknown' },
  not_applicable: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', label: 'N/A' },
};

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

  async function handleRunEvaluation() {
    if (!expense) return;
    setEvalError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/expenses/${expense.id}/evaluate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Evaluation failed');
        router.refresh();
      } catch (err) {
        setEvalError(err instanceof Error ? err.message : 'Evaluation failed');
      }
    });
  }

  // 1. State: Approved without recorded evaluation (Legacy / Manual Override)
  if (!evaluation && expense?.review_status === 'approved') {
    return (
      <div className="bg-white border border-amber-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Policy Evaluation</h2>
              <p className="text-xs text-amber-700">Approved without recorded policy evaluation</p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold rounded">
            Legacy / Override
          </span>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 leading-relaxed">
            <p className="font-medium text-amber-900">Historical Discrepancy Flag</p>
            This claim was approved without a persisted policy evaluation record. To maintain audit integrity, historical evaluation data has not been fabricated.
          </div>
          {canReevaluate && (
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run Policy Evaluation Now
            </button>
          )}
          {evalError && <p className="text-xs text-rose-600">{evalError}</p>}
        </div>
      </div>
    );
  }

  // 2. State: Evaluation pending
  if (!evaluation) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 text-sm mb-2">Policy Evaluation</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
          <span>Evaluation pending submission...</span>
        </div>
        {canReevaluate && expense && (
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isPending}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Evaluate Policy
          </button>
        )}
      </div>
    );
  }

  // 3. Overall Outcome Styling
  const overallConfig = {
    pass: { label: 'All Policy Rules Passed', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    fail: { label: 'Policy Violations Identified', color: 'bg-rose-50 border-rose-200 text-rose-800' },
    unknown: { label: 'Missing Context / Unresolved Policy', color: 'bg-amber-50 border-amber-200 text-amber-800' },
    needs_review: { label: 'Requires Finance Exception Review', color: 'bg-sky-50 border-sky-200 text-sky-800' },
  }[evaluation.overall_outcome] ?? { label: evaluation.overall_outcome, color: 'bg-gray-50 border-gray-200 text-gray-700' };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Policy Evaluation</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Evaluated {formatDateTime(evaluation.evaluated_at)} · Engine v{evaluation.evaluator_version}
          </p>
        </div>
        {canReevaluate && (
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isPending}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            title="Re-run policy evaluation"
          >
            <RefreshCw className={cn('w-4 h-4', isPending && 'animate-spin')} />
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Banner */}
        <div className={cn('px-3.5 py-2.5 rounded-md border text-sm font-medium flex items-center justify-between', overallConfig.color)}>
          <span>{overallConfig.label}</span>
          {evaluation.reimbursable_amount !== null ? (
            <span className="text-xs font-semibold tabular-nums">
              Reimbursable: ${Number(evaluation.reimbursable_amount).toFixed(2)} {evaluation.reimbursable_currency ?? 'USD'}
            </span>
          ) : (
            <span className="text-xs font-normal italic">Reimbursement amount unresolved</span>
          )}
        </div>

        {/* Rule findings list */}
        <div className="divide-y divide-gray-100 border-t border-b border-gray-100">
          {evaluation.rule_results.map((result: RuleResult) => {
            const config = OUTCOME_CONFIG[result.outcome] ?? OUTCOME_CONFIG.not_applicable;
            const Icon = config.icon;
            return (
              <div key={result.rule_id} className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
                    <span className="font-medium text-xs text-gray-900">{result.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {result.source_clause && (
                      <span className="text-[11px] text-gray-400 font-mono">{result.source_clause}</span>
                    )}
                    <span className={cn('text-[11px] px-1.5 py-0.5 rounded border font-semibold uppercase', config.bg, config.color)}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Detailed inputs, calculation & action */}
                <div className="pl-6 text-xs space-y-0.5 text-gray-500">
                  {Boolean(result.details?.relevant_inputs) && (
                    <p><span className="text-gray-400">Inputs:</span> {String(result.details.relevant_inputs)}</p>
                  )}
                  {Boolean(result.details?.calculation) && (
                    <p><span className="text-gray-400">Calculation:</span> {String(result.details.calculation)}</p>
                  )}
                  {result.required_action && result.required_action !== 'None' && (
                    <p className="text-amber-700 font-medium pt-0.5">
                      <span className="text-amber-800">Action:</span> {result.required_action}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Duplicate findings */}
        {evaluation.duplicate_findings && evaluation.duplicate_findings.length > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-md">
            <p className="text-xs font-semibold text-rose-800 mb-1">
              Duplicate Findings ({evaluation.duplicate_findings.length})
            </p>
            {evaluation.duplicate_findings.map((dup, i) => (
              <p key={i} className="text-xs text-rose-700 leading-relaxed">
                • <strong className="capitalize">{dup.type.replace('_', ' ')}</strong>: {dup.note}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
