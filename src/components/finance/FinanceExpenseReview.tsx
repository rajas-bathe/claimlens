'use client';

import type { Expense, Evaluation, ReviewEvent, UserSession } from '@/types';
import { formatCurrency, formatDate, snakeToTitle, cn } from '@/lib/utils';
import { ExtractionPanel } from '../expenses/ExtractionPanel';
import { EvaluationPanel } from '../expenses/EvaluationPanel';
import { AuditLog } from '../shared/AuditLog';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function FinanceExpenseReview({
  expense,
  evaluations,
  events,
  session: _,
}: {
  expense: Expense;
  evaluations: Evaluation[];
  events: ReviewEvent[];
  session: UserSession;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<'approve' | 'reject' | 'request' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const latestEval = evaluations[0] ?? null;

  async function handleAction() {
    if (!action) return;
    setError(null);
    startTransition(async () => {
      try {
        const statusMap = { approve: 'approved', reject: 'rejected', request: 'needs_information' };
        const res = await fetch(`/api/expenses/${expense.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_status: statusMap[action], note: note || null })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Action failed');
        router.refresh();
        setAction(null);
        setNote('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    });
  }

  const canAct = !['approved', 'rejected'].includes(expense.review_status);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/finance/review" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" /> Review Queue
      </Link>

      {/* Header */}
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
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(expense.original_amount, expense.original_currency)}</p>
            <p className="text-sm font-medium mt-1">
              <span className={cn('px-2 py-0.5 rounded border text-xs', {
                'bg-teal-50 text-teal-700 border-teal-200': expense.review_status === 'ready_for_approval',
                'bg-green-50 text-green-700 border-green-200': expense.review_status === 'approved',
                'bg-red-50 text-red-700 border-red-200': expense.review_status === 'rejected',
                'bg-amber-50 text-amber-700 border-amber-200': expense.review_status === 'needs_information',
                'bg-blue-50 text-blue-700 border-blue-200': expense.review_status === 'submitted',
                'bg-gray-100 text-gray-600 border-gray-200': expense.review_status === 'needs_review',
              })}>
                {snakeToTitle(expense.review_status)}
              </span>
            </p>
          </div>
        </div>
        {expense.business_purpose && <div className="mt-3"><span className="text-sm text-gray-500">Purpose: </span><span className="text-sm text-gray-900">{expense.business_purpose}</span></div>}
        {expense.client_name && <div className="mt-1"><span className="text-sm text-gray-500">Client: </span><span className="text-sm text-gray-900">{expense.client_name}</span></div>}
      </div>

      {/* Evidence + Evaluation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExtractionPanel expense={expense} />
        <EvaluationPanel evaluation={latestEval} />
      </div>

      {/* Finance actions */}
      {canAct && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="font-medium text-gray-900 mb-4">Decision</h2>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setAction(action === 'approve' ? null : 'approve')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors', action === 'approve' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}
            >
              <CheckCircle2 className="w-4 h-4" /> Approve
            </button>
            <button
              type="button"
              onClick={() => setAction(action === 'reject' ? null : 'reject')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors', action === 'reject' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button
              type="button"
              onClick={() => setAction(action === 'request' ? null : 'request')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors', action === 'request' ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}
            >
              <HelpCircle className="w-4 h-4" /> Request info
            </button>
          </div>
          {action && (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                {action === 'request' ? 'Information needed (required)' : 'Note (optional)'}
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
                placeholder={action === 'request' ? 'Describe what information or documentation is needed...' : 'Add a note for the employee...'}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={isPending || (action === 'request' && !note.trim())}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-60"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm {{ approve: 'Approval', reject: 'Rejection', request: 'Request' }[action]}
                </button>
                <button
                  type="button"
                  onClick={() => { setAction(null); setNote(''); setError(null); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit */}
      <AuditLog events={events} />
    </div>
  );
}
