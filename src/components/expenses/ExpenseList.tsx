"use client";

import type { Expense } from "@/types";
import { ClaimAmount } from "@/components/shared/ClaimAmount";
import { formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Search,
  Filter,
  ReceiptText,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: Clock,
  },
  submitted: {
    label: "Submitted",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Clock,
  },
  needs_information: {
    label: "Info needed",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: HelpCircle,
  },
  needs_review: {
    label: "Under review",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    icon: Clock,
  },
  ready_for_approval: {
    label: "Ready for approval",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    icon: CheckCircle2,
  },
  approved: {
    label: "Approved",
    color: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: AlertCircle,
  };
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium",
        config.color,
      )}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function getNextActionBadge(status: string) {
  switch (status) {
    case "needs_information":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
          Provide missing details
        </span>
      );
    case "draft":
      return (
        <span className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
          Draft · Not submitted
        </span>
      );
    case "submitted":
      return (
        <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
          Awaiting policy checks
        </span>
      );
    case "needs_review":
      return (
        <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
          In Finance review queue
        </span>
      );
    case "ready_for_approval":
      return (
        <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded font-medium">
          Awaiting finance approval
        </span>
      );
    case "approved":
      return (
        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded font-medium">
          Approved for reimbursement
        </span>
      );
    case "rejected":
      return (
        <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
          Rejected by Finance
        </span>
      );
    default:
      return null;
  }
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "needs_information", label: "Action required" },
  { value: "submitted", label: "In review" },
  { value: "ready_for_approval", label: "Ready" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Draft" },
];

export function ExpenseList({ expenses }: { expenses: Expense[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = expenses.filter((e) => {
    let matchesStatus = false;
    if (statusFilter === "all") matchesStatus = true;
    else if (statusFilter === "submitted") {
      matchesStatus =
        e.review_status === "submitted" || e.review_status === "needs_review";
    } else {
      matchesStatus = e.review_status === statusFilter;
    }

    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (e.merchant?.toLowerCase().includes(q) ?? false) ||
      (e.category?.toLowerCase().includes(q) ?? false) ||
      (e.city?.toLowerCase().includes(q) ?? false);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            aria-label="Search expenses"
            placeholder="Search merchant, category, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <select
            aria-label="Filter expenses by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md bg-white px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState hasExpenses={expenses.length > 0} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Merchant / Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider tabular-nums">
                  Amount
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                  Progress
                </th>
                <th className="px-4 py-3 w-8" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900 truncate max-w-[200px]">
          <Link
            href={`/dashboard/expenses/${expense.id}`}
            className="hover:underline"
          >
            {expense.merchant ?? (
              <span className="text-gray-400 italic">No merchant</span>
            )}
          </Link>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {expense.category ?? "Uncategorized"}
          {expense.city ? ` · ${expense.city}` : ""}
        </div>
        {/* Show status on mobile */}
        <div className="sm:hidden mt-1.5 flex flex-col gap-1">
          <StatusBadge status={expense.review_status} />
          {expense.review_status === "needs_information" && (
            <span className="text-xs text-amber-700 font-medium">
              Action Required
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 hidden md:table-cell whitespace-nowrap">
        {formatDate(expense.expense_date)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
        <ClaimAmount expense={expense} />
      </td>
      {/* Next Action Column */}
      <td className="px-4 py-3 hidden sm:table-cell">
        {getNextActionBadge(expense.review_status)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/dashboard/expenses/${expense.id}`}
          className="flex items-center justify-center text-gray-400 group-hover:text-blue-600 transition-colors rounded-md p-1"
          aria-label="View expense details"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </td>
    </tr>
  );
}

function EmptyState({ hasExpenses }: { hasExpenses: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
      <ReceiptText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      {hasExpenses ? (
        <>
          <p className="font-medium text-gray-900">No matching expenses</p>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your search or filter.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-gray-900">
            Your next expense starts here.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Upload a receipt and we’ll help you fill in the details.
          </p>
        </>
      )}
    </div>
  );
}
