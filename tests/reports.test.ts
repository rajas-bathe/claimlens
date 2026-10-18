import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExpenseReport,
  parseReportFilters,
  reportCsv,
} from "../src/lib/reports/model";
import type { Expense, UserSession } from "../src/types";
const employee = {
  id: "alice",
  membership: { role: "employee", display_name: "Alice" },
  company: { id: "company-a", name: "Company A" },
} as UserSession;
const finance = {
  ...employee,
  membership: { ...employee.membership, role: "finance" },
} as UserSession;
const filters = parseReportFilters(
  new URLSearchParams({ from: "2026-10-01", to: "2026-10-31" }),
);
const expense = (changes: Partial<Expense> = {}) =>
  ({
    id: "claim",
    company_id: "company-a",
    employee_id: "alice",
    expense_date: "2026-10-12",
    merchant: "Lunch",
    original_currency: "INR",
    original_amount: 0.1,
    review_status: "submitted",
    confirmed_fields: {},
    ...changes,
  }) as Expense;

test("Reports restrict employees to their own company and claims; finance can include company colleagues", () => {
  const rows = [
    expense(),
    expense({ id: "bob", employee_id: "bob" }),
    expense({ id: "foreign", company_id: "company-b" }),
  ];
  assert.deepEqual(
    buildExpenseReport(rows, employee, filters).rows.map((r) => r.id),
    ["claim"],
  );
  assert.deepEqual(
    buildExpenseReport(rows, finance, filters).rows.map((r) => r.id),
    ["claim", "bob"],
  );
});
test("Reports respect inclusive expense dates and status, excluding undated and out-of-period records", () => {
  const rows = [
    expense({
      id: "first",
      expense_date: "2026-10-01",
      review_status: "approved",
    }),
    expense({
      id: "last",
      expense_date: "2026-10-31",
      review_status: "approved",
    }),
    expense({ expense_date: null }),
    expense({ expense_date: "2026-09-30", review_status: "approved" }),
    expense(),
  ];
  assert.deepEqual(
    buildExpenseReport(rows, finance, {
      ...filters,
      status: "approved",
    }).rows.map((r) => r.id),
    ["first", "last"],
  );
});
test("Report totals use INR, exact arithmetic and exclude foreign claims without documented conversions", () => {
  const rows = [
    expense(),
    expense({ id: "second", original_amount: 0.2 }),
    expense({ original_currency: "EUR", original_amount: 10 }),
    expense({ original_amount: null }),
    expense({
      extraction_raw: {
        currency_is_inferred: true,
      } as Expense["extraction_raw"],
    }),
  ];
  const report = buildExpenseReport(rows, finance, filters);
  assert.deepEqual(report.totals, [{ currency: "INR", amount: 0.3 }]);
  assert.equal(report.unresolved, 3);
  assert.equal(report.rows.length, 5);
});
test("CSV neutralizes formulas and preserves quoted merchants, Unicode and original claim values", () => {
  const report = buildExpenseReport(
    [
      expense({ merchant: '=HYPERLINK("danger")' }),
      expense({ merchant: 'Café, "Two"', original_amount: 0 }),
    ],
    finance,
    filters,
  );
  const csv = reportCsv(report);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('"Café, ""Two"""'));
  assert.ok(csv.includes('"0"'));
  assert.ok(
    csv.includes("not payments") || csv.includes("does not indicate payment"),
  );
});
test("Report filters reject invalid dates, reversed ranges, oversized ranges and unsupported status", () => {
  const cases: Record<string, string>[] = [
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-10-20", to: "2026-10-01" },
    { from: "2024-01-01", to: "2026-10-01" },
    { from: "2026-10-01", to: "2026-10-31", status: "paid" },
  ];
  for (const values of cases)
    assert.throws(() => parseReportFilters(new URLSearchParams(values)));
});
