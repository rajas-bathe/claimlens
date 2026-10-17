import type { Evaluation, RuleResult } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { CheckCircle2, XCircle, HelpCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const OUTCOME_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Fail' },
  unknown: { icon: HelpCircle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Unknown' },
  not_applicable: { icon: MinusCircle, color: 'text-gray-400', bg: 'bg-gray-50', label: 'N/A' },
};

export function EvaluationPanel({ evaluation }: { evaluation: Evaluation | null }) {
  if (!evaluation) return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-medium text-gray-900">Policy evaluation</h2></div>
      <div className="p-5"><p className="text-sm text-gray-400">No evaluation available yet.</p></div>
    </div>
  );
  const overallConfig = { pass: { label: 'All rules passed', color: 'bg-green-50 border-green-200 text-green-800' }, fail: { label: 'Policy issues found', color: 'bg-red-50 border-red-200 text-red-800' }, unknown: { label: 'Insufficient information', color: 'bg-amber-50 border-amber-200 text-amber-800' }, needs_review: { label: 'Requires review', color: 'bg-purple-50 border-purple-200 text-purple-800' } }[evaluation.overall_outcome];
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-medium text-gray-900">Policy evaluation</h2>
        <p className="text-xs text-gray-400 mt-0.5">Evaluated {formatDateTime(evaluation.evaluated_at)}</p>
      </div>
      <div className="p-5 space-y-4">
        <div className={cn('px-3 py-2 rounded-md border text-sm font-medium', overallConfig.color)}>{overallConfig.label}</div>
        {evaluation.reimbursable_amount != null && (
          <div className="text-sm"><span className="text-gray-500">Reimbursable: </span><span className="font-semibold tabular-nums">{evaluation.reimbursable_amount} {evaluation.reimbursable_currency}</span></div>
        )}
        <div className="space-y-2">
          {evaluation.rule_results.map(result => {
            const config = OUTCOME_CONFIG[result.outcome]; const Icon = config.icon;
            return (
              <div key={result.rule_id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{result.message}</p>
                  {Object.keys(result.details).length > 0 && <p className="text-xs text-gray-400 mt-0.5">{Object.entries(result.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                </div>
                <span className={cn('text-xs px-1.5 py-0.5 rounded flex-shrink-0', config.bg, config.color)}>{config.label}</span>
              </div>
            );
          })}
        </div>
        {evaluation.duplicate_findings.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800 mb-1">Duplicate findings ({evaluation.duplicate_findings.length})</p>
            {evaluation.duplicate_findings.map((dup, i) => <p key={i} className="text-sm text-red-700">{dup.type === 'exact_hash' ? 'Exact duplicate' : 'Probable duplicate'}: {dup.note}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}
