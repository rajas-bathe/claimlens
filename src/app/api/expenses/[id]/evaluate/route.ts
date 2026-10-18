import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { evaluateAndPersistExpense } from "@/lib/policy/service";
import { ReviewError } from "@/lib/review/commands";

// POST /api/expenses/[id]/evaluate
// Deterministically evaluates an expense against the applicable policy for its transaction date
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    // Verify expense exists and user has access
    const { data: expense, error: fetchErr } = await supabase
      .from("expenses")
      .select("id, employee_id, company_id")
      .eq("id", id)
      .single();

    if (fetchErr || !expense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 },
      );
    }

    const isOwner = expense.employee_id === session.id && expense.company_id === session.membership.company_id;
    const isFinance =
      session.membership.role === "finance" &&
      expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const { evaluation, evalResult, nextStatus } =
      await evaluateAndPersistExpense({
        expenseId: id,
        actorId: session.id,
        actorRole: session.membership.role,
        supabase,
      });

    return NextResponse.json({
      success: true,
      data: {
        evaluation,
        outcome: evalResult.overall_outcome,
        reimbursable_amount: evalResult.reimbursable_amount,
        next_review_status: nextStatus,
      },
    });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHORIZED")
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
