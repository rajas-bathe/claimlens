import Decimal from "decimal.js";
import type { Expense, UserSession, ReviewStatus } from "@/types";
import { inrValue, BASE_CURRENCY } from "@/lib/currency";

export const REPORT_STATUSES = [
  "draft",
  "submitted",
  "needs_information",
  "needs_review",
  "ready_for_approval",
  "approved",
  "rejected",
] as const;
export type ReportFilters = {
  from: string;
  to: string;
  status: "all" | ReviewStatus;
};
export type ReportRow = {
  id: string;
  merchant: string;
  employee: string;
  date: string;
  category: string;
  status: string;
  amount: number | null;
  currency: string;
  confirmed: boolean;
  originalAmount: number | null;
  originalCurrency: string;
};
export type ExpenseReport = {
  company: string;
  scope: string;
  generatedAt: string;
  filters: ReportFilters;
  rows: ReportRow[];
  totals: { currency: string; amount: number }[];
  unresolved: number;
  approved: number;
  awaiting: number;
};

export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const status = params.get("status") ?? "all";
  const validDate = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error("Choose a valid start and end date.");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366)
    throw new Error("Choose a date range of up to one year.");
  if (status !== "all" && !REPORT_STATUSES.includes(status as ReviewStatus))
    throw new Error("Choose a valid claim status.");
  return { from, to, status: status as ReportFilters["status"] };
}

/** A second scope check protects exports even if a caller supplies unrelated rows. */
export function buildExpenseReport(
  expenses: Expense[],
  session: UserSession,
  filters: ReportFilters,
  names: Record<string, string> = {},
): ExpenseReport {
  const rows = expenses
    .filter(
      (e) =>
        e.company_id === session.company.id &&
        (session.membership.role === "finance" ||
          e.employee_id === session.id) &&
        Boolean(
          e.expense_date &&
          e.expense_date >= filters.from &&
          e.expense_date <= filters.to,
        ) &&
        (filters.status === "all" || e.review_status === filters.status),
    )
    .map((e) => ({
      id: e.id,
      merchant: e.merchant || "Merchant unavailable",
      employee:
        names[e.employee_id] ||
        (e.employee_id === session.id
          ? session.membership.display_name || "You"
          : "Employee"),
      date: e.expense_date!,
      category: e.category || "Uncategorized",
      status: e.review_status,
      amount: inrValue(e),
      currency: BASE_CURRENCY,
      confirmed: inrValue(e) !== null,
      originalAmount: e.original_amount ?? null,
      originalCurrency: e.original_currency ?? "",
    }));
  const totals = new Map<string, Decimal>();
  let unresolved = 0;
  for (const row of rows) {
    if (row.amount === null || !row.confirmed) {
      unresolved++;
      continue;
    }
    totals.set(
      row.currency,
      (totals.get(row.currency) ?? new Decimal(0)).plus(row.amount),
    );
  }
  return {
    company: session.company.name,
    scope:
      session.membership.role === "finance"
        ? "Company expenses"
        : "Your expenses",
    generatedAt: new Date().toISOString(),
    filters,
    rows,
    totals: [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: amount.toNumber() })),
    unresolved,
    approved: rows.filter((r) => r.status === "approved").length,
    awaiting: rows.filter((r) =>
      [
        "submitted",
        "needs_review",
        "ready_for_approval",
        "needs_information",
      ].includes(r.status),
    ).length,
  };
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Spreadsheet formula injection can occur even when values are quoted.
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function reportCsv(report: ExpenseReport): string {
  const rows: unknown[][] = [
    ["ClaimLens expense report", report.company],
    ["Scope", report.scope],
    ["Expense dates", report.filters.from, report.filters.to],
    ["Status filter", report.filters.status],
    ["Generated at (UTC)", report.generatedAt],
    [
      "Basis",
      "INR claim values using documented conversions. Unresolved conversions excluded from totals. Original receipt values retained for audit. Approval does not indicate payment.",
    ],
    [],
    ["Currency", "Confirmed INR claim total"],
    ...report.totals.map((t) => [t.currency, t.amount]),
    ["Claims excluded from totals", report.unresolved],
    [],
    [
      "Claim ID",
      "Merchant",
      "Employee",
      "Expense date",
      "Category",
      "Status",
      "INR amount",
      "Reporting currency",
      "INR value verified",
      "Original receipt amount",
      "Original receipt currency",
    ],
    ...report.rows.map((r) => [
      r.id,
      r.merchant,
      r.employee,
      r.date,
      r.category,
      r.status,
      r.amount,
      r.currency,
      r.confirmed ? "Yes" : "No",
      r.originalAmount,
      r.originalCurrency,
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
