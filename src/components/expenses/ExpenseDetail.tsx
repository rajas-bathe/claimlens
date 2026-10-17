'use client';

import type { Expense, Evaluation, ReviewEvent, UserSession, TripContext } from '@/types';
import { formatCurrency, formatDate, snakeToTitle, cn } from '@/lib/utils';
import { ExtractionPanel } from './ExtractionPanel';
import { EvaluationPanel } from './EvaluationPanel';
import { ReceiptViewer } from '../shared/ReceiptViewer';
import { AuditLog } from '../shared/AuditLog';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  ChevronLeft,
  AlertTriangle,
  Building2,
  Plane,
  Send,
  Loader2,
  CheckCircle2,
  HelpCircle,
  FileText
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const CATEGORIES = [
  'Accommodation',
  'Business meals',
  'Client entertainment',
  'Ground transport',
  'Air travel',
  'Office supplies',
  'Telecoms',
  'Training & conferences',
  'Other',
];

interface Props {
  expense: Expense;
  evaluations: Evaluation[];
  events: ReviewEvent[];
  session: UserSession;
  receiptUrl?: string | null;
}

export function ExpenseDetail({
  expense,
  evaluations,
  events,
  session,
  receiptUrl,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showClarificationForm, setShowClarificationForm] = useState(
    expense.review_status === 'needs_information'
  );

  // Form state for clarification response
  const [merchant, setMerchant] = useState(expense.merchant ?? '');
  const [expenseDate, setExpenseDate] = useState(expense.expense_date ?? '');
  const [category, setCategory] = useState(expense.category ?? '');
  const [city, setCity] = useState(expense.city ?? '');
  const [tripContext, setTripContext] = useState<TripContext>(expense.trip_context ?? 'office');
  const [businessPurpose, setBusinessPurpose] = useState(expense.business_purpose ?? '');
  const [clientName, setClientName] = useState(expense.client_name ?? '');
  const [attendeeCount, setAttendeeCount] = useState(
    expense.attendee_count ? String(expense.attendee_count) : ''
  );
  const [employeeNote, setEmployeeNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const latestEval = evaluations[0] ?? null;

  // Find latest clarification request note from finance
  const infoRequestEvent = events.find(
    (e) => e.event_type === 'information_requested' || (e.event_type === 'status_changed' && e.payload?.to === 'needs_information')
  );
  const financeRequestNote = infoRequestEvent?.note;

  async function handleResubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          merchant: merchant.trim() || null,
          expense_date: expenseDate || null,
          category: category || null,
          city: city.trim() || null,
          trip_context: tripContext,
          business_purpose: businessPurpose.trim() || null,
          client_name: clientName.trim() || null,
          attendee_count: attendeeCount ? parseInt(attendeeCount, 10) : null,
          review_status: 'submitted',
          note: employeeNote.trim() ? `Employee clarification: ${employeeNote.trim()}` : 'Clarification provided by employee',
        };

        const res = await fetch(`/api/expenses/${expense.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to update expense');

        setSuccessMsg('Clarification submitted successfully! Claim re-evaluated against policy.');
        setShowClarificationForm(false);
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to submit clarification');
      }
    });
  }

  const isEmployee = session.membership.role === 'employee';

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href={isEmployee ? '/dashboard/expenses' : '/dashboard/finance/review'}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to {isEmployee ? 'My Expenses' : 'Review Queue'}
      </Link>

      {/* Main Expense Details Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {expense.merchant ?? 'Unnamed expense'}
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

          <div className="sm:text-right">
            <p className="text-3xl font-bold tabular-nums text-gray-900">
              {formatCurrency(expense.original_amount, expense.original_currency)}
            </p>
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
                  'bg-gray-100 text-gray-700 border-gray-200': expense.review_status === 'draft',
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

      {/* Clarification Alert & Interactive Response Form */}
      {expense.review_status === 'needs_information' && isEmployee && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-900">Finance Clarification Requested</h2>
              {financeRequestNote ? (
                <p className="text-xs text-amber-800 mt-1 font-medium bg-amber-100/70 p-2.5 rounded border border-amber-200">
                  “{financeRequestNote}”
                </p>
              ) : (
                <p className="text-xs text-amber-800 mt-1">
                  Please provide the missing details requested by the finance reviewer below and resubmit your claim.
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleResubmit} className="bg-white border border-amber-200 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
              Update Claim Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Merchant</label>
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select category...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Context</label>
                <select
                  value={tripContext}
                  onChange={(e) => setTripContext(e.target.value as TripContext)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="office">Office / local</option>
                  <option value="business_trip">Business trip</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-gray-700 mb-1">Business Purpose</label>
                <textarea
                  value={businessPurpose}
                  onChange={(e) => setBusinessPurpose(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                  placeholder="Describe the business objective..."
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Client Name (Required for entertainment / client meals)
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. Acme Partners, John Doe"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Attendee Count</label>
                <input
                  type="number"
                  min="1"
                  value={attendeeCount}
                  onChange={(e) => setAttendeeCount(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. 2"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-gray-700 mb-1">
                  Clarification Note for Finance
                </label>
                <textarea
                  value={employeeNote}
                  onChange={(e) => setEmployeeNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                  placeholder="Explain the context or corrections made..."
                />
              </div>
            </div>

            {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}
            {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-60 transition-colors"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Send className="w-3.5 h-3.5" /> Resubmit for Policy Evaluation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive Receipt Viewer */}
      <ReceiptViewer
        receiptUrl={receiptUrl ?? null}
        fileName={expense.receipt_storage_path?.split('/').pop()}
        mimeType={expense.receipt_mime_type}
      />

      {/* Two-Column Grid: Extraction & Policy Evaluation Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExtractionPanel expense={expense} />
        <EvaluationPanel
          evaluation={latestEval}
          expense={expense}
          canReevaluate={true}
        />
      </div>

      {/* Complete Audit Log */}
      <AuditLog events={events} />
    </div>
  );
}
