'use client';

import { useState } from 'react';
import type { Expense, Evaluation, Membership, UserSession, PolicyVersion } from '@/types';
import { formatCurrency, formatDate, snakeToTitle, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  TrendingUp,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Calendar,
  DollarSign,
  FileText,
  User,
  ChevronRight,
  CheckSquare
} from 'lucide-react';

interface Props {
  expenses: Expense[];
  evaluations: Evaluation[];
  memberships: Membership[];
  policyVersions: PolicyVersion[];
  session: UserSession;
}

export function FinanceOverviewDashboard({
  expenses,
  evaluations,
  memberships,
  policyVersions,
  session: _,
}: Props) {
  const [timeRange, setTimeRange] = useState<'all' | '30d' | '7d'>('all');

  // Filter expenses by timeRange if needed
  const now = new Date();
  const filteredExpenses = expenses.filter((e) => {
    if (timeRange === 'all') return true;
    const date = new Date(e.expense_date || e.created_at);
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);
    if (timeRange === '7d') return diffDays <= 7;
    if (timeRange === '30d') return diffDays <= 30;
    return true;
  });

  // Metric 1: Claims awaiting action (submitted + needs_review)
  const awaitingAction = filteredExpenses.filter(
    (e) => e.review_status === 'needs_review' || e.review_status === 'submitted'
  );
  // Metric 2: Ready for approval
  const readyForApproval = filteredExpenses.filter((e) => e.review_status === 'ready_for_approval');
  const readyTotal = readyForApproval.reduce(
    (sum, e) => sum + (e.converted_amount ?? e.original_amount ?? 0),
    0
  );
  // Metric 3: Action required from employees
  const needsInfo = filteredExpenses.filter((e) => e.review_status === 'needs_information');
  // Metric 4: Approved period total
  const approvedClaims = filteredExpenses.filter((e) => e.review_status === 'approved');
  const approvedTotal = approvedClaims.reduce(
    (sum, e) => sum + (e.converted_amount ?? e.original_amount ?? 0),
    0
  );
  // Metric 5: Rejected
  const rejectedClaims = filteredExpenses.filter((e) => e.review_status === 'rejected');

  // Total amount submitted
  const totalSubmittedAmount = filteredExpenses.reduce(
    (sum, e) => sum + (e.converted_amount ?? e.original_amount ?? 0),
    0
  );

  // Compliance rate: claims that passed clean without exceptions
  const cleanPassCount = readyForApproval.length + approvedClaims.length;
  const evaluatedCount = filteredExpenses.filter((e) => e.review_status !== 'draft').length;
  const complianceRate = evaluatedCount > 0 ? Math.round((cleanPassCount / evaluatedCount) * 100) : 100;

  // Active policy info
  const activePolicy = policyVersions.find((p) => p.status === 'active');

  // Map employee IDs to names
  const memberMap = new Map<string, Membership>();
  for (const m of memberships) {
    memberMap.set(m.id, m);
  }

  // Aggregate evaluations to analyze exception drivers
  const evalMap = new Map<string, Evaluation>();
  for (const ev of evaluations) {
    if (!evalMap.has(ev.expense_id)) {
      evalMap.set(ev.expense_id, ev);
    }
  }

  // Count exception drivers across latest evaluations
  const exceptionCounts: Record<string, number> = {
    'Office meal cap exceeded': 0,
    'Missing client / business purpose': 0,
    'Prohibited line items (Alcohol, etc.)': 0,
    'Duplicate submission detected': 0,
    'Daily / city meal limit exceeded': 0,
    'No applicable policy on receipt date': 0,
  };

  for (const exp of filteredExpenses) {
    const ev = evalMap.get(exp.id);
    if (!ev) {
      if (exp.review_status === 'approved') {
        // legacy / override without recorded eval
      }
      continue;
    }
    if (ev.duplicate_findings && ev.duplicate_findings.length > 0) {
      exceptionCounts['Duplicate submission detected']++;
    }
    for (const r of ev.rule_results) {
      if (r.outcome === 'fail' || r.outcome === 'unknown') {
        if (r.rule_id.includes('per_expense_cap')) exceptionCounts['Office meal cap exceeded']++;
        else if (r.rule_id.includes('client_name') || r.rule_id.includes('business_purpose'))
          exceptionCounts['Missing client / business purpose']++;
        else if (r.rule_id.includes('prohibited') || r.rule_id.includes('item_restrictions'))
          exceptionCounts['Prohibited line items (Alcohol, etc.)']++;
        else if (r.rule_id.includes('daily_limit') || r.rule_id.includes('city_limit'))
          exceptionCounts['Daily / city meal limit exceeded']++;
        else if (r.rule_id.includes('effective_date') || r.message.toLowerCase().includes('policy'))
          exceptionCounts['No applicable policy on receipt date']++;
      }
    }
  }

  // Sorted exception drivers
  const sortedExceptions = Object.entries(exceptionCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  // Timeline / Trend grouping (by date)
  const dateBuckets: Record<string, { count: number; amount: number }> = {};
  for (const e of filteredExpenses) {
    const d = e.expense_date ?? (e.created_at ? e.created_at.slice(0, 10) : '2026-03-01');
    if (!dateBuckets[d]) dateBuckets[d] = { count: 0, amount: 0 };
    dateBuckets[d].count += 1;
    dateBuckets[d].amount += e.converted_amount ?? e.original_amount ?? 0;
  }
  const sortedDates = Object.keys(dateBuckets).sort().slice(-10); // last 10 dates
  const maxDayAmount = Math.max(...sortedDates.map((d) => dateBuckets[d]?.amount ?? 0), 100);

  // Urgent action queue preview (up to 5 claims needing review or submitted)
  const urgentQueue = filteredExpenses
    .filter((e) => ['needs_review', 'submitted', 'needs_information'].includes(e.review_status))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header with Title and Time Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Finance Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time expense metrics, compliance trends, and approval workflows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-1 text-xs font-medium text-gray-700 shadow-sm">
            {(['all', '30d', '7d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={cn(
                  'px-3 py-1.5 rounded transition-colors',
                  timeRange === r ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {r === 'all' ? 'All Time' : r === '30d' ? 'Last 30 Days' : 'Last 7 Days'}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/finance/review"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            Go to Review Queue
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Awaiting Action */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium uppercase tracking-wider">Awaiting Review</span>
            <span className="p-2 bg-purple-50 text-purple-700 rounded-md">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-semibold text-gray-900 tabular-nums">
              {awaitingAction.length}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Exceptions requiring Finance assessment
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-purple-700 font-medium">Needs Attention</span>
            <Link
              href="/dashboard/finance/review"
              className="text-gray-500 hover:text-blue-600 flex items-center gap-0.5"
            >
              Open Queue <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Card 2: Ready for Approval */}
        <div className="bg-white border border-teal-200 rounded-lg p-5 shadow-sm bg-gradient-to-br from-white to-teal-50/20">
          <div className="flex items-center justify-between text-teal-700">
            <span className="text-xs font-medium uppercase tracking-wider">Ready for Approval</span>
            <span className="p-2 bg-teal-100/70 text-teal-800 rounded-md">
              <CheckSquare className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-semibold text-gray-900 tabular-nums">
              {readyForApproval.length}
            </div>
            <p className="text-xs text-teal-700 font-medium mt-1">
              {formatCurrency(readyTotal, 'USD')} total validated clean
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-teal-100 flex items-center justify-between text-xs">
            <span className="text-teal-700 font-medium">1-Click Bulk Eligible</span>
            <Link
              href="/dashboard/finance/review"
              className="text-teal-800 font-medium hover:underline flex items-center gap-0.5"
            >
              Approve Now <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Card 3: Action Required from Employee */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium uppercase tracking-wider">Info Requested</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-md">
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-semibold text-gray-900 tabular-nums">
              {needsInfo.length}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Awaiting clarification from employees
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Pending Employee Resubmission</span>
          </div>
        </div>

        {/* Card 4: Approved Period Reimbursement */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium uppercase tracking-wider">Approved Total</span>
            <span className="p-2 bg-green-50 text-green-700 rounded-md">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-semibold text-gray-900 tabular-nums">
              {formatCurrency(approvedTotal, 'USD')}
            </div>
            <p className="text-xs text-green-700 font-medium mt-1">
              {approvedClaims.length} claims approved for payout
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Compliance Rate: <strong className="text-gray-900 font-semibold">{complianceRate}%</strong></span>
          </div>
        </div>
      </div>

      {/* Visual Charts & Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Submission Volume & Spending Velocity (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Submission & Spending Trends
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Daily expense volume and dollar amounts processed by ClaimLens
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">Total Volume</span>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">
                {formatCurrency(totalSubmittedAmount, 'USD')}
              </p>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          {sortedDates.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No expenses in selected range</div>
          ) : (
            <div className="space-y-4">
              <div className="h-48 flex items-end gap-3 pt-6 px-2">
                {sortedDates.map((date) => {
                  const b = dateBuckets[date]!;
                  const heightPct = Math.max(Math.round((b.amount / maxDayAmount) * 100), 8);
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-12 bg-gray-900 text-white text-[11px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg z-10">
                        {date}: {formatCurrency(b.amount, 'USD')} ({b.count} claims)
                      </div>
                      <div className="w-full bg-blue-50 group-hover:bg-blue-100 rounded-t flex flex-col justify-end h-full transition-colors">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full bg-blue-600 group-hover:bg-blue-700 rounded-t transition-all"
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 truncate max-w-full font-mono mt-1">
                        {date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                <span>Earliest: {sortedDates[0]}</span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" /> Reimbursable Amount ($)
                </span>
                <span>Latest: {sortedDates[sortedDates.length - 1]}</span>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Review Status Distribution & Policy Summary (1 col) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="border-b border-gray-100 pb-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Status Distribution
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Current lifecycle state across {filteredExpenses.length} claims
              </p>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="space-y-3">
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
                {filteredExpenses.length > 0 && (
                  <>
                    <div
                      style={{ width: `${(readyForApproval.length / filteredExpenses.length) * 100}%` }}
                      className="bg-teal-500"
                      title={`Ready: ${readyForApproval.length}`}
                    />
                    <div
                      style={{ width: `${(awaitingAction.length / filteredExpenses.length) * 100}%` }}
                      className="bg-purple-500"
                      title={`Awaiting Action: ${awaitingAction.length}`}
                    />
                    <div
                      style={{ width: `${(needsInfo.length / filteredExpenses.length) * 100}%` }}
                      className="bg-amber-500"
                      title={`Info Needed: ${needsInfo.length}`}
                    />
                    <div
                      style={{ width: `${(approvedClaims.length / filteredExpenses.length) * 100}%` }}
                      className="bg-green-500"
                      title={`Approved: ${approvedClaims.length}`}
                    />
                    <div
                      style={{ width: `${(rejectedClaims.length / filteredExpenses.length) * 100}%` }}
                      className="bg-red-500"
                      title={`Rejected: ${rejectedClaims.length}`}
                    />
                  </>
                )}
              </div>

              {/* Legend List */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-center justify-between text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                    Ready for Approval
                  </span>
                  <span className="font-semibold tabular-nums">{readyForApproval.length}</span>
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    Under Review / Submitted
                  </span>
                  <span className="font-semibold tabular-nums">{awaitingAction.length}</span>
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Clarification Requested
                  </span>
                  <span className="font-semibold tabular-nums">{needsInfo.length}</span>
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Approved
                  </span>
                  <span className="font-semibold tabular-nums">{approvedClaims.length}</span>
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Rejected
                  </span>
                  <span className="font-semibold tabular-nums">{rejectedClaims.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Policy Status Box */}
          <div className="mt-6 pt-4 border-t border-gray-100 bg-gray-50 -mx-6 -mb-6 p-4 rounded-b-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                Active Policy: v{activePolicy?.version_number ?? 1}
              </span>
              <Link
                href="/dashboard/finance/policy"
                className="text-blue-600 hover:underline font-medium"
              >
                Manage Policy
              </Link>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Effective from {formatDate(activePolicy?.effective_from ?? '2026-01-01')} ·{' '}
              {activePolicy?.structured_rules?.length ?? 8} configured rules active.
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: Top Policy Exception Drivers & Urgent Queue Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exception Drivers */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Policy Exception Drivers
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Leading triggers routing claims into human review
              </p>
            </div>
          </div>

          {sortedExceptions.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-80" />
              No policy exceptions logged in current claims!
            </div>
          ) : (
            <div className="space-y-4">
              {sortedExceptions.map(([driver, count]) => {
                const maxCount = sortedExceptions[0][1];
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={driver} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-800">{driver}</span>
                      <span className="text-gray-500 tabular-nums">
                        {count} claim{count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={cn(
                          'h-full rounded-full',
                          driver.includes('cap') || driver.includes('limit')
                            ? 'bg-amber-500'
                            : driver.includes('Prohibited') || driver.includes('Duplicate')
                            ? 'bg-red-500'
                            : 'bg-blue-500'
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Priority Review Items Preview */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Priority Claims Requiring Review
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Claims currently blocking reimbursement
              </p>
            </div>
            <Link
              href="/dashboard/finance/review"
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              View All ({awaitingAction.length + needsInfo.length})
            </Link>
          </div>

          {urgentQueue.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto mb-2 opacity-80" />
              All claims reviewed! Nothing awaiting action.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {urgentQueue.map((exp) => {
                const member = memberMap.get(exp.employee_id);
                return (
                  <div
                    key={exp.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 hover:bg-gray-50/50 rounded transition-colors px-1"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {exp.merchant ?? 'Unnamed Expense'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {member?.display_name || member?.email || 'Employee'} · {formatDate(exp.expense_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        {formatCurrency(exp.original_amount, exp.original_currency)}
                      </span>
                      <Link
                        href={`/dashboard/finance/review/${exp.id}`}
                        className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
