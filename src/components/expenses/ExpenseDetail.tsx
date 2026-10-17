import type { Expense, Evaluation, ReviewEvent, UserSession } from '@/types';
import { formatCurrency, formatDate, snakeToTitle } from '@/lib/utils';
import { ExtractionPanel } from './ExtractionPanel';
import { EvaluationPanel } from './EvaluationPanel';
import { AuditLog } from '../shared/AuditLog';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function ExpenseDetail({ expense, evaluations, events, session }: { expense: Expense; evaluations: Evaluation[]; events: ReviewEvent[]; session: UserSession; }) {
  const latestEval = evaluations[0] ?? null;
  return (
    <div className="space-y-6">
      <Link href={session.membership.role === 'finance' ? '/dashboard/finance/review' : '/dashboard/expenses'} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{expense.merchant ?? 'Unnamed expense'}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              <span>{formatDate(expense.expense_date)}</span>
              {expense.category && <><span>·</span><span>{expense.category}</span></>}
              {expense.city && <><span>·</span><span>{expense.city}</span></>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{formatCurrency(expense.original_amount, expense.original_currency)}</p>
            {expense.converted_currency && expense.converted_currency !== expense.original_currency && (
              <p className="text-sm text-gray-400">≈ {formatCurrency(expense.converted_amount, expense.converted_currency)}</p>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4 text-sm flex-wrap">
          <div><span className="text-gray-400">Processing:</span> <span className="font-medium text-gray-700">{snakeToTitle(expense.processing_status)}</span></div>
          <div><span className="text-gray-400">Review:</span> <span className="font-medium text-gray-700">{snakeToTitle(expense.review_status)}</span></div>
          {expense.trip_context && <div><span className="text-gray-400">Context:</span> <span className="font-medium text-gray-700">{snakeToTitle(expense.trip_context)}</span></div>}
        </div>
        {expense.business_purpose && <div className="mt-3"><span className="text-sm text-gray-500">Business purpose: </span><span className="text-sm text-gray-900">{expense.business_purpose}</span></div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExtractionPanel expense={expense} />
        <EvaluationPanel evaluation={latestEval} />
      </div>
      <AuditLog events={events} />
    </div>
  );
}
