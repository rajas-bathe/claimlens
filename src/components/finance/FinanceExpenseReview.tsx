'use client';

import type { Expense, Evaluation, ReviewEvent, UserSession, Membership, PolicyVersion } from '@/types';
import { formatCurrency, formatDate, snakeToTitle, getInitials, cn } from '@/lib/utils';
import { ExtractionPanel } from '../expenses/ExtractionPanel';
import { EvaluationPanel } from '../expenses/EvaluationPanel';
import { ReceiptViewer } from '../shared/ReceiptViewer';
import { AuditLog } from '../shared/AuditLog';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Building2,
  Plane,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Calendar,
  Layers,
  ArrowRight,
  RotateCw
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  expense: Expense;
  evaluations: Evaluation[];
  events: ReviewEvent[];
  session: UserSession;
  receiptUrl?: string | null;
  prevId?: string | null;
  nextId?: string | null;
  queuePosition?: { current: number; total: number };
  submitter?: Membership | null;
  sameDayExpenses?: Expense[];
  candidateDuplicates?: Expense[];
  activePolicy?: PolicyVersion | null;
}

export function FinanceExpenseReview({
  expense,
  evaluations,
  events,
  session: _,
  receiptUrl,
  prevId,
  nextId,
  queuePosition,
  submitter,
  sameDayExpenses = [],
  candidateDuplicates = [],
  activePolicy,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<'approve' | 'override' | 'reject' | 'request' | null>(null);
  const [note, setNote] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [distinctClaims, setDistinctClaims] = useState<Set<string>>(new Set());

  const latestEval = evaluations[0] ?? null;

  // Determine if claim is clean or requires policy override
  const isCleanPass =
    latestEval?.overall_outcome === 'pass' &&
    expense.review_status === 'ready_for_approval' &&
    (!latestEval.duplicate_findings || latestEval.duplicate_findings.length === 0);

  const canAct = !['approved', 'rejected'].includes(expense.review_status);

  // Calculate same-day daily accumulation
  const dailyTotal = sameDayExpenses.reduce(
    (sum, e) => sum + (e.original_amount ?? 0),
    0
  );

  // Find daily meal limit for this city/context from policy
  const _dailyLimitRule = activePolicy?.structured_rules?.find(
    (r) => r.type === 'daily_cap' || r.type === 'city_cap'
  );
  const isTier1City = ['New York', 'San Francisco', 'London', 'Tokyo'].some(
    (c) => expense.city?.toLowerCase().includes(c.toLowerCase())
  );
  const dailyLimitAmount = isTier1City ? 100 : 75; // standard policy configuration
  const exceedsDailyLimit = expense.trip_context === 'business_trip' && dailyTotal > dailyLimitAmount;

  async function handleAction() {
    if (!action) return;
    setError(null);

    // Validation
    if (action === 'request' && !note.trim()) {
      setError('Please specify what information the employee must provide.');
      return;
    }
    if (action === 'reject' && !note.trim()) {
      setError('Please provide a reason for rejecting this claim.');
      return;
    }
    if (action === 'override' && !overrideReason.trim()) {
      setError('A formal justification reason is required to approve a claim with policy exceptions.');
      return;
    }

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {};

        if (action === 'approve') {
          payload.review_status = 'approved';
          if (note.trim()) payload.note = note.trim();
        } else if (action === 'override') {
          payload.review_status = 'approved';
          payload.is_override = true;
          payload.override_reason = overrideReason.trim();
          payload.note = `Policy override approved: ${overrideReason.trim()}`;
        } else if (action === 'reject') {
          payload.review_status = 'rejected';
          payload.note = note.trim();
        } else if (action === 'request') {
          payload.review_status = 'needs_information';
          payload.note = note.trim();
        }

        const res = await fetch(`/api/expenses/${expense.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Action failed');

        router.refresh();
        setAction(null);
        setNote('');
        setOverrideReason('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    });
  }

  function markAsDistinct(dupId: string) {
    setDistinctClaims((prev) => new Set(prev).add(dupId));
  }

  return (
    <div className="space-y-6">
      {/* Queue Navigation Bar */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <Link
          href="/dashboard/finance/review"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Review Queue
        </Link>

        {queuePosition && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">
              Claim <strong className="text-gray-900">{queuePosition.current}</strong> of{' '}
              <strong className="text-gray-900">{queuePosition.total}</strong>
            </span>
            <div className="flex items-center gap-1">
              {prevId ? (
                <Link
                  href={`/dashboard/finance/review/${prevId}`}
                  className="p-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  title="Previous Claim"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              ) : (
                <span className="p-1 text-gray-300">
                  <ChevronLeft className="w-4 h-4" />
                </span>
              )}
              {nextId ? (
                <Link
                  href={`/dashboard/finance/review/${nextId}`}
                  className="p-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  title="Next Claim"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <span className="p-1 text-gray-300">
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Primary Header Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {expense.merchant ?? 'Unnamed Expense'}
              </h1>
              {expense.trip_context === 'business_trip' ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                  <Plane className="w-3 h-3" /> Trip
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">
                  <Building2 className="w-3 h-3" /> Office
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs sm:text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1.5 font-medium text-gray-800">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center justify-center text-[10px] font-bold">
                  {getInitials(submitter?.display_name || submitter?.email || 'EM')}
                </span>
                {submitter?.display_name || submitter?.email || 'Employee'}
              </span>
              <span>·</span>
              <span>{formatDate(expense.expense_date)}</span>
              {expense.category && (
                <>
                  <span>·</span>
                  <span className="font-medium text-gray-700">{expense.category}</span>
                </>
              )}
              {expense.city && (
                <>
                  <span>·</span>
                  <span>{expense.city}</span>
                </>
              )}
            </div>
          </div>

          {/* Amount and Status Pill */}
          <div className="sm:text-right">
            <div className="text-3xl font-bold tabular-nums text-gray-900">
              {formatCurrency(expense.original_amount, expense.original_currency)}
            </div>
            {expense.converted_currency && expense.converted_currency !== expense.original_currency && (
              <p className="text-xs text-gray-400 mt-0.5">
                ≈ {formatCurrency(expense.converted_amount, expense.converted_currency)}
              </p>
            )}
            <div className="mt-2">
              <span
                className={cn('inline-flex px-2.5 py-1 rounded border text-xs font-semibold', {
                  'bg-teal-50 text-teal-800 border-teal-200': expense.review_status === 'ready_for_approval',
                  'bg-green-50 text-green-800 border-green-200': expense.review_status === 'approved',
                  'bg-red-50 text-red-800 border-red-200': expense.review_status === 'rejected',
                  'bg-amber-50 text-amber-800 border-amber-200': expense.review_status === 'needs_information',
                  'bg-blue-50 text-blue-800 border-blue-200': expense.review_status === 'submitted',
                  'bg-purple-50 text-purple-800 border-purple-200': expense.review_status === 'needs_review',
                })}
              >
                {snakeToTitle(expense.review_status)}
              </span>
            </div>
          </div>
        </div>

        {/* Business Purpose & Client Details */}
        {(expense.business_purpose || expense.client_name || expense.attendee_count) && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {expense.business_purpose && (
              <div className="sm:col-span-2">
                <span className="text-gray-400 font-medium uppercase tracking-wider block">Business Purpose</span>
                <p className="text-gray-900 mt-0.5">{expense.business_purpose}</p>
              </div>
            )}
            {expense.client_name && (
              <div>
                <span className="text-gray-400 font-medium uppercase tracking-wider block">Client / Attendees</span>
                <p className="text-gray-900 mt-0.5 font-medium">
                  {expense.client_name}
                  {expense.attendee_count ? ` (${expense.attendee_count} attendees)` : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receipt Viewer Canvas */}
      <ReceiptViewer
        receiptUrl={receiptUrl ?? null}
        fileName={expense.receipt_storage_path?.split('/').pop()}
        mimeType={expense.receipt_mime_type}
      />

      {/* Daily Spending Accumulation Table (if multiple same-day claims exist) */}
      {sameDayExpenses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Daily Spending Accumulation — {formatDate(expense.expense_date)}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500">Cumulative Daily Sum: </span>
              <strong className="text-sm tabular-nums text-gray-900 font-bold">
                {formatCurrency(dailyTotal, expense.original_currency || 'USD')}
              </strong>
              {dailyLimitAmount && (
                <span className="text-xs text-gray-400 ml-1">/ ${dailyLimitAmount} cap</span>
              )}
            </div>
          </div>

          {exceedsDailyLimit && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Combined daily expenses ({formatCurrency(dailyTotal, 'USD')}) exceed the configured daily
                limit of ${dailyLimitAmount} ({isTier1City ? 'Tier-1 High Cost City' : 'Standard'}).
              </span>
            </div>
          )}

          <div className="divide-y divide-gray-100 border border-gray-100 rounded overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-3 py-2">Merchant</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sameDayExpenses.map((sde) => (
                  <tr
                    key={sde.id}
                    className={cn(sde.id === expense.id ? 'bg-blue-50/50 font-medium' : 'hover:bg-gray-50')}
                  >
                    <td className="px-3 py-2">
                      {sde.merchant ?? 'Unnamed'}
                      {sde.id === expense.id && (
                        <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{sde.category ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border capitalize">
                        {sde.review_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(sde.original_amount, sde.original_currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Candidate Duplicate Comparison (if potential duplicates exist) */}
      {candidateDuplicates.length > 0 && (
        <div className="bg-red-50/40 border border-red-200 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 className="text-xs font-bold uppercase tracking-wide">
              Potential Duplicate Claims Detected ({candidateDuplicates.length})
            </h3>
          </div>
          <p className="text-xs text-red-700">
            ClaimLens identified existing claims matching this receipt file hash, date, or amount. Review carefully:
          </p>

          <div className="space-y-2">
            {candidateDuplicates.map((dup) => {
              const isMarked = distinctClaims.has(dup.id);
              const isExact = dup.receipt_file_hash === expense.receipt_file_hash;

              return (
                <div
                  key={dup.id}
                  className="bg-white border border-red-200 rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span>{dup.merchant ?? 'Unnamed'}</span>
                      <span className="text-gray-400">·</span>
                      <span>{formatDate(dup.expense_date)}</span>
                      <span className="text-gray-400">·</span>
                      <span className="tabular-nums font-bold">
                        {formatCurrency(dup.original_amount, dup.original_currency)}
                      </span>
                      {isExact && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[10px] font-bold">
                          Exact File Hash Match
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      Status: <strong className="capitalize">{dup.review_status}</strong> · ID: {dup.id.slice(0, 8)}...
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/finance/review/${dup.id}`}
                      target="_blank"
                      className="px-2.5 py-1 text-gray-600 border border-gray-200 rounded hover:bg-gray-50 text-[11px]"
                    >
                      Compare Claim
                    </Link>
                    {!isMarked ? (
                      <button
                        type="button"
                        onClick={() => markAsDistinct(dup.id)}
                        className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded text-[11px] font-medium"
                      >
                        Mark as Distinct
                      </button>
                    ) : (
                      <span className="text-[11px] text-green-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Marked Distinct
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Column Grid: Evidence Extraction & Policy Evaluation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExtractionPanel expense={expense} />
        <EvaluationPanel
          evaluation={latestEval}
          expense={expense}
          canReevaluate={true}
        />
      </div>

      {/* Finance Decision & Workflow Actions Card */}
      {canAct && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Finance Review Decision
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isCleanPass
                  ? 'All policy rules verified clean. Eligible for standard one-click approval.'
                  : 'Policy issues or unresolved conditions detected. Normal approval requires a policy override.'}
              </p>
            </div>
          </div>

          {/* Action Choice Buttons */}
          <div className="flex gap-2.5 flex-wrap">
            {/* If clean pass: Standard 1-click approve */}
            {isCleanPass ? (
              <button
                type="button"
                onClick={() => setAction(action === 'approve' ? null : 'approve')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium border transition-colors shadow-sm',
                  action === 'approve'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100'
                )}
              >
                <CheckCircle2 className="w-4 h-4" /> Approve Reimbursement
              </button>
            ) : (
              /* Non-clean or unvalidated: Policy Override approve */
              <button
                type="button"
                onClick={() => setAction(action === 'override' ? null : 'override')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium border transition-colors shadow-sm',
                  action === 'override'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                )}
              >
                <AlertTriangle className="w-4 h-4" /> Approve (Policy Override)
              </button>
            )}

            {/* Request Info */}
            <button
              type="button"
              onClick={() => setAction(action === 'request' ? null : 'request')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium border transition-colors shadow-sm',
                action === 'request'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              <HelpCircle className="w-4 h-4" /> Request Clarification
            </button>

            {/* Reject */}
            <button
              type="button"
              onClick={() => setAction(action === 'reject' ? null : 'reject')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium border transition-colors shadow-sm',
                action === 'reject'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              <XCircle className="w-4 h-4" /> Reject Claim
            </button>
          </div>

          {/* Form when action is selected */}
          {action && (
            <div className="mt-4 p-4 border rounded-lg bg-gray-50/75 space-y-3">
              {action === 'override' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Policy Override Justification Required
                  </p>
                  <p>
                    This claim contains unresolved items, cap breaches, or date mismatches. Approving it will
                    record an official policy override in the audit log. Please state why an exception is granted.
                  </p>
                </div>
              )}

              {action === 'override' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                    Override Justification Note (Required) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                    placeholder="e.g. Approved per VP Sales approval email; high-value client meeting justified exceeding office cap."
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                    {action === 'request'
                      ? 'Information Requested from Employee (Required)'
                      : action === 'reject'
                      ? 'Rejection Reason (Required)'
                      : 'Approval Note (Optional)'}
                    {(action === 'request' || action === 'reject') && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
                    placeholder={
                      action === 'request'
                        ? 'e.g. Please provide the client name and number of attendees for this entertainment meal.'
                        : action === 'reject'
                        ? 'e.g. Alcohol expenses cannot be reimbursed per Section 3.2 of the company expense policy.'
                        : 'Optional comment for the audit trail...'
                    }
                  />
                </div>
              )}

              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-white text-xs sm:text-sm font-semibold rounded-md shadow-sm disabled:opacity-60 transition-colors',
                    action === 'override'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : action === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : action === 'request'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-teal-600 hover:bg-teal-700'
                  )}
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm{' '}
                  {action === 'override'
                    ? 'Policy Override & Approval'
                    : action === 'approve'
                    ? 'Approval'
                    : action === 'reject'
                    ? 'Rejection'
                    : 'Clarification Request'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAction(null);
                    setNote('');
                    setOverrideReason('');
                    setError(null);
                  }}
                  className="px-3.5 py-2 text-xs sm:text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Log */}
      <AuditLog events={events} />
    </div>
  );
}
