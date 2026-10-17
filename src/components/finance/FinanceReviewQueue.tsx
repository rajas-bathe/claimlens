'use client';

import type { Expense, Evaluation, Membership, UserSession } from '@/types';
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils';
import Link from 'next/link';
import { useState, useTransition, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ChevronRight,
  CheckSquare,
  Loader2,
  Search,
  Filter,
  AlertTriangle,
  FileQuestion,
  ShieldAlert,
  Building2,
  Plane,
  X
} from 'lucide-react';

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
  { value: 'ready_for_approval', label: 'Ready for Approval' },
  { value: 'needs_review', label: 'Under Review' },
  { value: 'needs_information', label: 'Info Needed' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

interface Props {
  expenses: Expense[];
  evaluations?: Evaluation[];
  memberships?: Membership[];
  session: UserSession;
}

export function FinanceReviewQueue({
  expenses,
  evaluations = [],
  memberships = [],
  session: _,
}: Props) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedContext, setSelectedContext] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create lookup maps
  const memberMap = useMemo(() => {
    const map = new Map<string, Membership>();
    for (const m of memberships) map.set(m.id, m);
    return map;
  }, [memberships]);

  const evalMap = useMemo(() => {
    const map = new Map<string, Evaluation>();
    for (const ev of evaluations) {
      if (!map.has(ev.expense_id)) {
        map.set(ev.expense_id, ev);
      }
    }
    return map;
  }, [evaluations]);

  // Derive actionable short finding for an expense
  function getShortFinding(expense: Expense): { text: string; style: string; icon: 'check' | 'warn' | 'alert' | 'info' } {
    const ev = evalMap.get(expense.id);

    if (expense.review_status === 'approved') {
      if (!ev) {
        return {
          text: 'Legacy Approval (No Eval)',
          style: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: 'info',
        };
      }
      return {
        text: 'Approved & Validated',
        style: 'bg-green-50 text-green-700 border-green-200',
        icon: 'check',
      };
    }

    if (expense.review_status === 'ready_for_approval') {
      return {
        text: 'Ready for 1-Click Approval',
        style: 'bg-teal-50 text-teal-700 border-teal-200 font-medium',
        icon: 'check',
      };
    }

    if (expense.review_status === 'needs_information') {
      return {
        text: 'Clarification Requested',
        style: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'warn',
      };
    }

    if (expense.review_status === 'rejected') {
      return {
        text: 'Rejected by Reviewer',
        style: 'bg-red-50 text-red-700 border-red-200',
        icon: 'alert',
      };
    }

    // Otherwise under review or submitted - inspect evaluation
    if (!ev) {
      return {
        text: 'Evaluation Pending',
        style: 'bg-gray-100 text-gray-600 border-gray-200',
        icon: 'info',
      };
    }

    // Check duplicate findings first
    if (ev.duplicate_findings && ev.duplicate_findings.length > 0) {
      const isExact = ev.duplicate_findings.some((d) => d.type === 'exact_hash');
      return {
        text: isExact ? 'Exact Duplicate Receipt' : 'Probable Duplicate Claim',
        style: 'bg-red-50 text-red-700 border-red-200 font-medium',
        icon: 'alert',
      };
    }

    // Check policy effective date check
    const dateCheck = ev.rule_results.find((r) => r.rule_id === 'policy_effective_date_check');
    if (dateCheck && dateCheck.outcome !== 'pass') {
      return {
        text: 'No Policy Active for Date',
        style: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: 'warn',
      };
    }

    // Check required fields
    const missingField = ev.rule_results.find(
      (r) => r.rule_id.includes('missing_field') || (r.outcome === 'fail' && r.message.toLowerCase().includes('client'))
    );
    if (missingField) {
      if (missingField.message.toLowerCase().includes('client')) {
        return { text: 'Missing Client Name', style: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'warn' };
      }
      return { text: 'Missing Required Info', style: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'warn' };
    }

    // Check prohibited items
    const prohibited = ev.rule_results.find((r) => r.rule_id.includes('prohibited') && r.outcome === 'fail');
    if (prohibited) {
      return {
        text: 'Prohibited Item Detected',
        style: 'bg-red-50 text-red-700 border-red-200 font-medium',
        icon: 'alert',
      };
    }

    // Check per-expense cap
    const capFail = ev.rule_results.find((r) => r.rule_id.includes('per_expense_cap') && r.outcome === 'fail');
    if (capFail) {
      return {
        text: 'Office Meal Cap Exceeded',
        style: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: 'warn',
      };
    }

    // Check daily limit
    const dailyFail = ev.rule_results.find((r) => (r.rule_id.includes('daily_limit') || r.rule_id.includes('city')) && r.outcome === 'fail');
    if (dailyFail) {
      return {
        text: 'Daily Meal Limit Exceeded',
        style: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: 'warn',
      };
    }

    // Check approval threshold
    const thresh = ev.rule_results.find((r) => r.rule_id.includes('threshold') && r.outcome !== 'pass');
    if (thresh) {
      return {
        text: 'Executive Approval ($500+)',
        style: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: 'info',
      };
    }

    // Check itemization
    const itemization = ev.rule_results.find((r) => r.rule_id.includes('itemization') && r.outcome === 'fail');
    if (itemization) {
      return {
        text: 'Incomplete Itemization',
        style: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'warn',
      };
    }

    // Fallback to first non-passing rule
    const firstNonPass = ev.rule_results.find((r) => r.outcome === 'fail' || r.outcome === 'unknown');
    if (firstNonPass) {
      return {
        text: firstNonPass.message.slice(0, 32) + (firstNonPass.message.length > 32 ? '...' : ''),
        style: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'warn',
      };
    }

    return {
      text: 'Under Review',
      style: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: 'info',
    };
  }

  // Filter logic
  const filtered = expenses.filter((e) => {
    // Status filter
    if (statusFilter !== 'all' && e.review_status !== statusFilter) return false;

    // Employee filter
    if (selectedEmployee !== 'all' && e.employee_id !== selectedEmployee) return false;

    // Context filter
    if (selectedContext !== 'all' && e.trip_context !== selectedContext) return false;

    // Date range filter
    if (dateFrom && e.expense_date && e.expense_date < dateFrom) return false;
    if (dateTo && e.expense_date && e.expense_date > dateTo) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const member = memberMap.get(e.employee_id);
      const memberMatch =
        member?.display_name?.toLowerCase().includes(q) ||
        member?.email?.toLowerCase().includes(q);
      const merchantMatch = e.merchant?.toLowerCase().includes(q);
      const categoryMatch = e.category?.toLowerCase().includes(q);
      const cityMatch = e.city?.toLowerCase().includes(q);
      if (!memberMatch && !merchantMatch && !categoryMatch && !cityMatch) return false;
    }

    return true;
  });

  const readyForBulk = filtered.filter((e) => e.review_status === 'ready_for_approval');

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function selectAllReady() {
    setSelected((prev) => {
      const s = new Set(prev);
      readyForBulk.forEach((e) => s.add(e.id));
      return s;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/finance/bulk-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expense_ids: Array.from(selected) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Bulk approve failed');
        setBulkResult(
          `Approved ${data.data.approved} claim(s). ${
            data.data.skipped > 0 ? `${data.data.skipped} skipped (revalidation required).` : ''
          }`
        );
        setSelected(new Set());
        window.location.reload();
      } catch (err) {
        setBulkResult(`Error: ${err instanceof Error ? err.message : 'Bulk approval failed'}`);
      }
    });
  }

  // Counts for tabs
  const counts: Record<string, number> = {};
  for (const e of expenses) {
    counts[e.review_status] = (counts[e.review_status] ?? 0) + 1;
  }

  // Clear all filters helper
  const hasActiveFilters = search || selectedEmployee !== 'all' || selectedContext !== 'all' || dateFrom || dateTo;
  function resetFilters() {
    setSearch('');
    setSelectedEmployee('all');
    setSelectedContext('all');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="space-y-4">
      {/* Metric Quick-Filter Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'ready_for_approval', label: 'Ready for Approval', color: 'teal' },
          { key: 'needs_review', label: 'Under Review', color: 'purple' },
          { key: 'needs_information', label: 'Info Needed', color: 'amber' },
          { key: 'submitted', label: 'Submitted', color: 'blue' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setStatusFilter(item.key)}
            className={cn(
              'text-left p-3.5 rounded-lg border transition-all shadow-sm',
              statusFilter === item.key
                ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-400'
                : 'bg-white border-gray-200 hover:border-gray-300'
            )}
          >
            <p className="text-2xl font-semibold tabular-nums text-gray-900">
              {counts[item.key] ?? 0}
            </p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{item.label}</p>
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 flex-wrap border-b border-gray-200 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              statusFilter === f.value
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            {f.label}
            {f.value !== 'all' && counts[f.value] ? (
              <span className="ml-1.5 opacity-80 tabular-nums">({counts[f.value]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Advanced Filter Bar: Search, Employee, Context, Date Range */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search merchant, employee, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Employee Dropdown */}
          <div>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="all">All Employees</option>
              {memberships
                .filter((m) => m.role === 'employee')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.email}
                  </option>
                ))}
            </select>
          </div>

          {/* Context Dropdown */}
          <div>
            <select
              value={selectedContext}
              onChange={(e) => setSelectedContext(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="all">All Contexts</option>
              <option value="office">Office / Local</option>
              <option value="business_trip">Business Trip</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-1/2 px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              title="From date"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-1/2 px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              title="To date"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-500">
            <span>Showing {filtered.length} filtered results</span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Banner */}
      {readyForBulk.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3.5 bg-teal-50 border border-teal-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-4 h-4 text-teal-600" />
            <span className="text-xs sm:text-sm text-teal-900 font-medium">
              {readyForBulk.length} clean claim(s) ready for 1-click approval
            </span>
            <button
              type="button"
              onClick={selectAllReady}
              className="text-xs sm:text-sm text-teal-700 underline font-semibold hover:text-teal-900"
            >
              Select all ready
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-gray-700 ml-2"
              >
                Clear selection
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 text-white text-xs sm:text-sm font-medium rounded-md hover:bg-teal-700 disabled:opacity-60 shadow-sm"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Approve {selected.size} Claim{selected.size > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {bulkResult && (
        <div
          className={cn(
            'px-4 py-3 rounded-md text-xs sm:text-sm border shadow-sm',
            bulkResult.startsWith('Error')
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-green-50 border-green-200 text-green-700'
          )}
        >
          {bulkResult}
        </div>
      )}

      {/* Main Review Queue Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
          <FileQuestion className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">No expenses match your filters</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting search query or active filter tags.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/75">
                  <th className="px-3.5 py-3 w-8" aria-label="Select" />
                  <th className="px-3.5 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px]">
                    Employee & Merchant
                  </th>
                  <th className="px-3.5 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] hidden md:table-cell">
                    Date & Context
                  </th>
                  <th className="px-3.5 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] text-right tabular-nums">
                    Amount
                  </th>
                  <th className="px-3.5 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px]">
                    Actionable Finding
                  </th>
                  <th className="px-3.5 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] text-center hidden sm:table-cell">
                    Status
                  </th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((expense) => {
                  const member = memberMap.get(expense.employee_id);
                  const finding = getShortFinding(expense);
                  const isReady = expense.review_status === 'ready_for_approval';

                  return (
                    <tr
                      key={expense.id}
                      className={cn(
                        'hover:bg-blue-50/30 transition-colors group',
                        selected.has(expense.id) && 'bg-teal-50/40'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-3.5 py-3">
                        {isReady ? (
                          <input
                            type="checkbox"
                            checked={selected.has(expense.id)}
                            onChange={() => toggleSelect(expense.id)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-600 w-4 h-4"
                            aria-label="Select expense"
                          />
                        ) : (
                          <span className="w-4 h-4 inline-block" />
                        )}
                      </td>

                      {/* Employee & Merchant */}
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0">
                            {getInitials(member?.display_name || member?.email || 'EM')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate max-w-[200px]">
                              {expense.merchant ?? <span className="text-gray-400 italic">No merchant</span>}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[220px]">
                              {member?.display_name || member?.email || 'Unknown employee'}
                              {expense.category && <span> · {expense.category}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date & Context */}
                      <td className="px-3.5 py-3 hidden md:table-cell whitespace-nowrap">
                        <div className="text-gray-900 font-medium">{formatDate(expense.expense_date)}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {expense.trip_context === 'business_trip' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <Plane className="w-2.5 h-2.5" /> Trip {expense.city ? `(${expense.city})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
                              <Building2 className="w-2.5 h-2.5" /> Office
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-3.5 py-3 text-right tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(expense.original_amount, expense.original_currency)}
                        </div>
                        {expense.converted_currency &&
                          expense.converted_currency !== expense.original_currency && (
                            <div className="text-[11px] text-gray-400">
                              ≈ {formatCurrency(expense.converted_amount, expense.converted_currency)}
                            </div>
                          )}
                      </td>

                      {/* Short Actionable Finding */}
                      <td className="px-3.5 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs border max-w-[240px] truncate',
                            finding.style
                          )}
                        >
                          {finding.icon === 'check' && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                          {finding.icon === 'warn' && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                          {finding.icon === 'alert' && <ShieldAlert className="w-3 h-3 flex-shrink-0" />}
                          {finding.icon === 'info' && <Clock className="w-3 h-3 flex-shrink-0" />}
                          <span className="truncate">{finding.text}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-3 text-center hidden sm:table-cell whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded border text-[11px] font-medium',
                            STATUS_CONFIG[expense.review_status]?.color ??
                              'bg-gray-100 text-gray-600 border-gray-200'
                          )}
                        >
                          {STATUS_CONFIG[expense.review_status]?.label ?? expense.review_status}
                        </span>
                      </td>

                      {/* Action Link */}
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/dashboard/finance/review/${expense.id}`}
                          className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100 transition-colors"
                          aria-label="Review expense"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
