'use client';

import type { Expense, UserSession } from '@/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CheckCircle2, XCircle, HelpCircle, Clock, ChevronRight, CheckSquare, Loader2 } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  needs_information: { label: 'Info needed', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  needs_review: { label: 'Under review', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  ready_for_approval: { label: 'Ready', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  approved: { label: 'Approved', color: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-200' },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ready_for_approval', label: 'Ready' },
  { value: 'needs_review', label: 'Review' },
  { value: 'needs_information', label: 'Info needed' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export function FinanceReviewQueue({ expenses, session: _ }: { expenses: Expense[]; session: UserSession }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = expenses.filter(e => filter === 'all' || e.review_status === filter);
  const readyForBulk = filtered.filter(e => e.review_status === 'ready_for_approval');

  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function selectAllReady() {
    setSelected(prev => {
      const s = new Set(prev);
      readyForBulk.forEach(e => s.add(e.id));
      return s;
    });
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/finance/bulk-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expense_ids: Array.from(selected) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Bulk approve failed');
        setBulkResult(`Approved ${data.data.approved} expense(s). ${data.data.skipped > 0 ? `${data.data.skipped} skipped (revalidation required).` : ''}`);
        setSelected(new Set());
        window.location.reload();
      } catch (err) {
        setBulkResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
      }
    });
  }

  const counts: Record<string, number> = {};
  for (const e of expenses) {
    counts[e.review_status] = (counts[e.review_status] ?? 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['ready_for_approval', 'needs_review', 'needs_information', 'submitted'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn('text-left p-3 rounded-lg border transition-colors', filter === s ? 'border-blue-300 bg-blue-50' : 'bg-white border-gray-200 hover:border-gray-300')}
          >
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{counts[s] ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{STATUS_CONFIG[s]?.label ?? s}</p>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn('px-3 py-1.5 text-sm rounded-md transition-colors', filter === f.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100')}
          >
            {f.label}{f.value !== 'all' && counts[f.value] ? ` (${counts[f.value]})` : ''}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {readyForBulk.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <CheckSquare className="w-4 h-4 text-teal-600" />
          <span className="text-sm text-teal-800">{readyForBulk.length} claim(s) ready for approval</span>
          <button type="button" onClick={selectAllReady} className="text-sm text-teal-700 underline font-medium">
            Select all
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={isPending}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 disabled:opacity-60"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Approve {selected.size} selected
            </button>
          )}
        </div>
      )}

      {bulkResult && (
        <div className={cn('px-4 py-3 rounded-md text-sm border', bulkResult.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700')}>
          {bulkResult}
        </div>
      )}

      {/* Queue table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500">No expenses matching this filter.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8" aria-label="Select" />
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employee / Merchant</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide tabular-nums">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(expense => (
                <tr key={expense.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3">
                    {expense.review_status === 'ready_for_approval' && (
                      <input
                        type="checkbox"
                        checked={selected.has(expense.id)}
                        onChange={() => toggleSelect(expense.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                        aria-label="Select expense"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[200px]">
                      {expense.merchant ?? <span className="text-gray-400 italic">No merchant</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{expense.category ?? 'Uncategorized'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{formatDate(expense.expense_date)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="font-medium text-gray-900">{formatCurrency(expense.original_amount, expense.original_currency)}</div>
                    {expense.converted_currency && expense.converted_currency !== expense.original_currency && (
                      <div className="text-xs text-gray-400">≈ {formatCurrency(expense.converted_amount, expense.converted_currency)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={cn('inline-flex px-2 py-0.5 rounded border text-xs font-medium', STATUS_CONFIG[expense.review_status]?.color ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                      {STATUS_CONFIG[expense.review_status]?.label ?? expense.review_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/finance/review/${expense.id}`}
                      className="flex items-center justify-center text-gray-300 group-hover:text-gray-500 p-1 rounded"
                      aria-label="Review expense"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
