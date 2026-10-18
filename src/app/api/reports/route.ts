import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServerComponentClient } from "@/lib/supabase/server";
import { buildExpenseReport, parseReportFilters } from "@/lib/reports/model";
import type { Expense } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    let filters;
    try {
      filters = parseReportFilters(request.nextUrl.searchParams);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const supabase = await createServerComponentClient();
    const expenses: Expense[] = [];
    // Supabase's default row limit must not silently truncate a report.
    for (let offset = 0; ; offset += 500) {
      let query = supabase
        .from("expenses")
        .select(
          "id,company_id,employee_id,merchant,expense_date,category,review_status,original_amount,original_currency,confirmed_fields,extraction_raw",
        )
        .eq("company_id", session.company.id)
        .gte("expense_date", filters.from)
        .lte("expense_date", filters.to)
        .order("expense_date", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (session.membership.role !== "finance")
        query = query.eq("employee_id", session.id);
      if (filters.status !== "all")
        query = query.eq("review_status", filters.status);
      const { data, error } = await query;
      if (error)
        throw new Error("Your report could not be loaded. Please retry.");
      const page = data ?? [];
      expenses.push(...(page as Expense[]));
      if (page.length < 500) break;
      if (offset >= 49500)
        return NextResponse.json(
          { error: "This report is too large. Choose a shorter date range." },
          { status: 422 },
        );
    }
    const names: Record<string, string> = {};
    if (session.membership.role === "finance") {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id,display_name")
        .eq("company_id", session.company.id);
      if (error)
        throw new Error("Employee names could not be loaded. Please retry.");
      for (const member of data ?? [])
        names[member.user_id] = member.display_name || "Employee";
    }
    const report = buildExpenseReport(expenses, session, filters, names);
    return NextResponse.json(
      { report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Report generation failed. Please retry.";
    return NextResponse.json(
      { error: message },
      {
        status: message === "UNAUTHORIZED" ? 401 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
